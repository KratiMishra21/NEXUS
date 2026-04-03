"""
NEXUS | infra-gateway/on-prem-vault/aggregator.py
Person B: "The Bridge" Engineer

PURPOSE:
  Runs as a Docker sidecar INSIDE the client's firewall.
  It reads raw telemetry events from a local SQLite buffer (written by Person A's SDK),
  aggregates them into anonymized "Insight Packets", and prepares them for secure sync.

  RAW EVENTS NEVER LEAVE THIS CONTAINER. Only the aggregated InsightPacket does.

FLOW:
  SDK (logger.js) --> SQLite (local buffer) --> aggregator.py --> insight_packets table
                                                                        |
                                                             sync_service.py picks up from here
"""

import sqlite3
import json
import hashlib
import uuid
import logging
import os
import time
from datetime import datetime, timezone
from collections import defaultdict
from typing import Optional

# ─── Configuration ────────────────────────────────────────────────────────────

DB_PATH = os.environ.get("NEXUS_DB_PATH", "/vault/nexus_vault.db")
AGGREGATION_INTERVAL_SECONDS = int(os.environ.get("NEXUS_AGG_INTERVAL", 300))  # 5 min default
CPU_CIRCUIT_BREAKER_THRESHOLD = float(os.environ.get("NEXUS_CPU_LIMIT", 2.0))  # 2% CPU max

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [NEXUS-VAULT] %(levelname)s - %(message)s"
)
log = logging.getLogger(__name__)


# ─── Database Setup ───────────────────────────────────────────────────────────

def init_db(conn: sqlite3.Connection):
    """
    Creates the two core tables if they don't exist.
    raw_events:      Written by the SDK (Person A). Treated as an inbox.
    insight_packets: Written by this aggregator. Read by sync_service.py.
    """
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS raw_events (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id       TEXT UNIQUE NOT NULL,
            tenant_id      TEXT NOT NULL,
            session_id     TEXT NOT NULL,
            user_hash      TEXT,
            event_type     TEXT NOT NULL,
            feature_id     TEXT NOT NULL,
            feature_module TEXT,
            timestamp      TEXT NOT NULL,
            duration_ms    INTEGER,
            deployment_type TEXT DEFAULT 'ON_PREM',
            geo_region     TEXT,
            error_code     TEXT,
            metadata       TEXT,
            is_processed   INTEGER DEFAULT 0    -- 0 = pending, 1 = aggregated
        );

        CREATE INDEX IF NOT EXISTS idx_raw_events_processed ON raw_events(is_processed);
        CREATE INDEX IF NOT EXISTS idx_raw_events_tenant    ON raw_events(tenant_id);

        CREATE TABLE IF NOT EXISTS insight_packets (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            packet_id     TEXT UNIQUE NOT NULL,
            tenant_id     TEXT NOT NULL,
            period_start  TEXT NOT NULL,
            period_end    TEXT NOT NULL,
            payload_json  TEXT NOT NULL,      -- The full InsightPacket JSON
            checksum      TEXT NOT NULL,
            is_synced     INTEGER DEFAULT 0,  -- 0 = pending sync, 1 = sent to cloud
            created_at    TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_packets_synced ON insight_packets(is_synced);
    """)
    conn.commit()
    log.info("Database schema initialized at %s", DB_PATH)


# ─── Circuit Breaker ──────────────────────────────────────────────────────────

def get_cpu_usage() -> float:
    """
    Reads CPU usage from /proc/stat for a lightweight check.
    Returns a float percentage (0.0 - 100.0).
    Falls back to 0.0 if /proc/stat is unavailable (e.g., Windows dev machines).
    """
    try:
        with open("/proc/stat", "r") as f:
            line = f.readline()
        fields = [float(x) for x in line.strip().split()[1:]]
        idle  = fields[3]
        total = sum(fields)
        return 100.0 * (1.0 - idle / total) if total > 0 else 0.0
    except FileNotFoundError:
        return 0.0


def is_circuit_open() -> bool:
    """
    Returns True (circuit OPEN = halt telemetry) if CPU is above threshold.
    Protects the host application from being impacted by the sidecar.
    """
    usage = get_cpu_usage()
    if usage > CPU_CIRCUIT_BREAKER_THRESHOLD:
        log.warning(
            "CIRCUIT BREAKER OPEN: CPU at %.1f%% (limit: %.1f%%). Skipping cycle.",
            usage, CPU_CIRCUIT_BREAKER_THRESHOLD
        )
        return True
    return False


# ─── Core Aggregation Logic ───────────────────────────────────────────────────

def fetch_pending_events(conn: sqlite3.Connection) -> list[dict]:
    """
    Fetches all unprocessed raw events from the local SQLite buffer.
    Only picks up rows where is_processed = 0.
    """
    cursor = conn.execute("""
        SELECT event_id, tenant_id, session_id, user_hash, event_type,
               feature_id, feature_module, timestamp, duration_ms, error_code
        FROM   raw_events
        WHERE  is_processed = 0
        ORDER  BY timestamp ASC
    """)
    columns = [desc[0] for desc in cursor.description]
    rows    = [dict(zip(columns, row)) for row in cursor.fetchall()]
    log.info("Fetched %d pending event(s) for aggregation.", len(rows))
    return rows


def aggregate_events(events: list[dict], tenant_id: str) -> Optional[dict]:
    """
    Core aggregation function.
    Takes a flat list of raw events for ONE tenant and returns
    a single InsightPacket dict.

    CRITICAL: No raw user identifiers (user_hash, session_id) appear in the output.
              Only counts and averages are included.
    """
    if not events:
        return None

    timestamps   = [e["timestamp"] for e in events]
    period_start = min(timestamps)
    period_end   = max(timestamps)

    # ── Group events by feature_id ────────────────────────────────────────────
    by_feature: dict[str, list[dict]] = defaultdict(list)
    for event in events:
        by_feature[event["feature_id"]].append(event)

    feature_summaries = []
    for feature_id, feat_events in by_feature.items():

        # Event type counts
        success_count = sum(1 for e in feat_events if e["event_type"] == "FEATURE_SUCCESS")
        fail_count    = sum(1 for e in feat_events if e["event_type"] == "FEATURE_FAIL")
        abandon_count = sum(1 for e in feat_events if e["event_type"] == "FEATURE_ABANDON")

        # Average duration (exclude None values)
        durations    = [e["duration_ms"] for e in feat_events if e.get("duration_ms") is not None]
        avg_duration = round(sum(durations) / len(durations), 2) if durations else 0.0

        # Unique user count — count distinct hashes but DON'T include the hashes
        unique_user_count = len({e["user_hash"] for e in feat_events if e.get("user_hash")})

        # Error distribution: error_code → count  (no PII, just error codes)
        error_dist: dict[str, int] = defaultdict(int)
        for e in feat_events:
            if e.get("error_code"):
                error_dist[e["error_code"]] += 1

        feature_summaries.append({
            "feature_id":         feature_id,
            "feature_module":     feat_events[0].get("feature_module", "UNKNOWN"),
            "total_invocations":  len(feat_events),
            "success_count":      success_count,
            "fail_count":         fail_count,
            "abandon_count":      abandon_count,
            "avg_duration_ms":    avg_duration,
            "unique_user_count":  unique_user_count,
            "error_distribution": dict(error_dist),
        })

    # ── Build the InsightPacket body ──────────────────────────────────────────
    packet_body = {
        "packet_id":         str(uuid.uuid4()),
        "tenant_id":         tenant_id,
        "period_start":      period_start,
        "period_end":        period_end,
        "schema_version":    "1.0.0",
        "feature_summaries": feature_summaries,
    }

    # Tamper-detection checksum (computed BEFORE adding the checksum field)
    body_json = json.dumps(packet_body, sort_keys=True)
    checksum  = hashlib.sha256(body_json.encode()).hexdigest()
    packet_body["checksum"] = checksum

    return packet_body


def save_packet_and_mark_events(
    conn: sqlite3.Connection,
    packet: dict,
    event_ids: list[str]
):
    """
    Saves the InsightPacket to the DB and marks all source events as
    is_processed = 1 in a single atomic transaction.

    If the DB write fails, events remain is_processed = 0 and will be
    retried on the next aggregation cycle.
    """
    now         = datetime.now(timezone.utc).isoformat()
    packet_json = json.dumps(packet)

    try:
        with conn:  # 'with conn' = automatic commit on success, rollback on error
            conn.execute("""
                INSERT INTO insight_packets
                    (packet_id, tenant_id, period_start, period_end,
                     payload_json, checksum, is_synced, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?)
            """, (
                packet["packet_id"],
                packet["tenant_id"],
                packet["period_start"],
                packet["period_end"],
                packet_json,
                packet["checksum"],
                now,
            ))

            # Batch UPDATE — avoids N+1 individual queries
            placeholders = ",".join("?" * len(event_ids))
            conn.execute(
                f"UPDATE raw_events SET is_processed = 1 WHERE event_id IN ({placeholders})",
                event_ids
            )

        log.info(
            "Saved InsightPacket [%s] covering %d event(s) for tenant %s.",
            packet["packet_id"], len(event_ids), packet["tenant_id"]
        )
    except sqlite3.Error as e:
        log.error("DB error saving packet: %s. Events will be retried next cycle.", e)


# ─── Main Aggregation Cycle ───────────────────────────────────────────────────

def run_aggregation_cycle(conn: sqlite3.Connection):
    """
    Single end-to-end aggregation cycle:
      1. Check CPU circuit breaker — abort if host is under load.
      2. Fetch all unprocessed events from SQLite.
      3. Group events by tenant_id for strict tenant isolation.
      4. For each tenant: aggregate events → create InsightPacket.
      5. Save each packet and mark its source events as processed.
    """
    if is_circuit_open():
        return

    events = fetch_pending_events(conn)
    if not events:
        log.info("No pending events. Sleeping until next cycle.")
        return

    # Group by tenant — each tenant's data is processed and stored separately
    by_tenant: dict[str, list[dict]] = defaultdict(list)
    for event in events:
        by_tenant[event["tenant_id"]].append(event)

    log.info("Processing %d event(s) across %d tenant(s).", len(events), len(by_tenant))

    for tenant_id, tenant_events in by_tenant.items():
        packet = aggregate_events(tenant_events, tenant_id)
        if packet:
            event_ids = [e["event_id"] for e in tenant_events]
            save_packet_and_mark_events(conn, packet, event_ids)


def run_forever():
    """
    Daemon entry point. Connects to SQLite, initializes the schema,
    then runs aggregation cycles in an infinite loop.
    """
    log.info(
        "NEXUS On-Prem Vault Aggregator starting.\n"
        "  DB path   : %s\n"
        "  Interval  : %d seconds\n"
        "  CPU limit : %.1f%%",
        DB_PATH, AGGREGATION_INTERVAL_SECONDS, CPU_CIRCUIT_BREAKER_THRESHOLD
    )

    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    init_db(conn)

    while True:
        try:
            log.info("─── Starting aggregation cycle ───")
            run_aggregation_cycle(conn)
        except Exception as e:
            log.error("Unhandled error in aggregation cycle: %s", e, exc_info=True)
        finally:
            log.info("Cycle complete. Next run in %ds.", AGGREGATION_INTERVAL_SECONDS)
            time.sleep(AGGREGATION_INTERVAL_SECONDS)


if __name__ == "__main__":
    run_forever()