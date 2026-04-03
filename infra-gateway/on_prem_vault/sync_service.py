"""
NEXUS | infra-gateway/on-prem-vault/sync_service.py
Person B: "The Bridge" Engineer

PURPOSE:
  Reads finalized InsightPackets from the local SQLite DB (written by aggregator.py)
  and pushes them to the NEXUS Cloud Ingestor endpoint.

  This is the ONLY component that has outbound internet access.
  It sends ONLY aggregated, checksum-verified packets — never raw events.

SECURITY MODEL:
  - Mutual TLS (mTLS) authentication to the cloud endpoint.
  - Each packet is checksum-verified before sending.
  - Exponential backoff with jitter on failures.
  - A failed sync is retried; the local packet is NOT deleted until cloud confirms receipt.

FLOW:
  aggregator.py --> insight_packets (is_synced=0) --> sync_service.py --> Cloud Ingestor API
                                                                                  |
                                                                    marks is_synced=1 on success
"""

import sqlite3
import json
import hashlib
import logging
import os
import time
import random
import requests
from datetime import datetime, timezone

# ─── Configuration ────────────────────────────────────────────────────────────

DB_PATH            = os.environ.get("NEXUS_DB_PATH", "/vault/nexus_vault.db")
CLOUD_INGESTOR_URL = os.environ.get("NEXUS_CLOUD_URL", "https://ingestor.nexus-cloud.internal/api/v1/ingest")
SYNC_INTERVAL_SEC  = int(os.environ.get("NEXUS_SYNC_INTERVAL", 60))   # Check every 60 seconds
MAX_BATCH_SIZE     = int(os.environ.get("NEXUS_SYNC_BATCH", 20))      # Max packets per HTTP call
MAX_RETRIES        = int(os.environ.get("NEXUS_SYNC_RETRIES", 5))
TLS_CERT_PATH      = os.environ.get("NEXUS_TLS_CERT", "/certs/client.crt")
TLS_KEY_PATH       = os.environ.get("NEXUS_TLS_KEY", "/certs/client.key")
TLS_CA_PATH        = os.environ.get("NEXUS_TLS_CA",  "/certs/nexus-ca.crt")
SYNC_API_KEY       = os.environ.get("NEXUS_API_KEY", "")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [NEXUS-SYNC] %(levelname)s - %(message)s"
)
log = logging.getLogger(__name__)


# ─── Integrity Verification ───────────────────────────────────────────────────

def verify_packet_checksum(packet_json: str, expected_checksum: str) -> bool:
    """
    Re-computes the checksum on the stored JSON to detect any local tampering
    since the aggregator wrote the packet.
    The checksum was computed on the body WITHOUT the checksum field — so we
    pop it before re-hashing.
    """
    try:
        packet_data     = json.loads(packet_json)
        stored_checksum = packet_data.pop("checksum", None)

        recomputed = hashlib.sha256(
            json.dumps(packet_data, sort_keys=True).encode()
        ).hexdigest()

        if recomputed != expected_checksum or recomputed != stored_checksum:
            log.error(
                "CHECKSUM MISMATCH — packet may be corrupted. "
                "Expected=%s  Got=%s", expected_checksum, recomputed
            )
            return False
        return True
    except Exception as e:
        log.error("Error during checksum verification: %s", e)
        return False


# ─── HTTP Transport ───────────────────────────────────────────────────────────

def build_http_session() -> requests.Session:
    """
    Builds a requests.Session with:
      - mTLS client certificate (if certs exist on disk)
      - CA verification of the cloud server certificate
      - Bearer token auth header
      - NEXUS custom headers for tracing
    Falls back to plain HTTP in dev mode when certs are absent.
    """
    session = requests.Session()

    # mTLS — provide client cert for mutual authentication
    if os.path.exists(TLS_CERT_PATH) and os.path.exists(TLS_KEY_PATH):
        session.cert = (TLS_CERT_PATH, TLS_KEY_PATH)
        log.info("mTLS client cert loaded from %s", TLS_CERT_PATH)
    else:
        log.warning(
            "mTLS certs not found at %s — using no client cert (dev mode only).",
            TLS_CERT_PATH
        )

    # Verify cloud server against our CA bundle
    if os.path.exists(TLS_CA_PATH):
        session.verify = TLS_CA_PATH
    else:
        log.warning(
            "CA cert not found at %s — TLS verification disabled (dev mode only!).",
            TLS_CA_PATH
        )
        session.verify = False

    if SYNC_API_KEY:
        session.headers.update({"Authorization": f"Bearer {SYNC_API_KEY}"})

    session.headers.update({
        "Content-Type":          "application/json",
        "X-NEXUS-Schema-Version": "1.0.0",
        "X-NEXUS-Source":        "ON_PREM_VAULT",
    })
    return session


def send_packets_to_cloud(session: requests.Session, packets: list[dict]) -> list[str]:
    """
    POSTs a batch of InsightPackets to the Cloud Ingestor.
    Returns a list of packet_ids that were successfully acknowledged by the cloud.
    Uses exponential backoff with jitter on transient failures.
    Does NOT retry on 4xx errors (auth / schema problems need human intervention).
    """
    if not packets:
        return []

    import uuid
    payload = {
        "batch_id":     str(uuid.uuid4()),
        "sent_at":      datetime.now(timezone.utc).isoformat(),
        "packet_count": len(packets),
        "packets":      [json.loads(p["payload_json"]) for p in packets],
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = session.post(
                CLOUD_INGESTOR_URL,
                json=payload,
                timeout=(5, 30)   # (connect_timeout_sec, read_timeout_sec)
            )
            response.raise_for_status()

            acked_ids = response.json().get("acknowledged_packet_ids", [])
            log.info("Cloud ACKed %d / %d packets.", len(acked_ids), len(packets))
            return acked_ids

        except requests.exceptions.ConnectionError as e:
            log.warning("Attempt %d/%d — Connection error: %s", attempt, MAX_RETRIES, e)
        except requests.exceptions.Timeout:
            log.warning("Attempt %d/%d — Request timed out.", attempt, MAX_RETRIES)
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code
            log.error("Attempt %d/%d — HTTP %d: %s", attempt, MAX_RETRIES, status_code, e.response.text)
            if status_code in (400, 401, 403):
                log.error("Non-retryable error (HTTP %d). Aborting batch.", status_code)
                return []

        # Exponential backoff with jitter: 2s, 4s, 8s, 16s, 32s (+random 0–1s)
        wait = (2 ** attempt) + random.uniform(0, 1)
        log.info("Retrying in %.1f seconds...", wait)
        time.sleep(wait)

    log.error(
        "All %d retry attempts exhausted. Packets will be retried next cycle.",
        MAX_RETRIES
    )
    return []


# ─── Core Sync Logic ──────────────────────────────────────────────────────────

def fetch_unsynced_packets(conn: sqlite3.Connection) -> list[dict]:
    """Fetches up to MAX_BATCH_SIZE unsynced packets, oldest first (FIFO)."""
    cursor = conn.execute("""
        SELECT id, packet_id, tenant_id, payload_json, checksum, created_at
        FROM   insight_packets
        WHERE  is_synced = 0
        ORDER  BY created_at ASC
        LIMIT  ?
    """, (MAX_BATCH_SIZE,))
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def mark_packets_synced(conn: sqlite3.Connection, packet_ids: list[str]):
    """
    Marks packets as is_synced = 1 so they are never re-sent.
    Only called AFTER the cloud confirms receipt.
    """
    if not packet_ids:
        return
    placeholders = ",".join("?" * len(packet_ids))
    with conn:
        conn.execute(
            f"UPDATE insight_packets SET is_synced = 1 WHERE packet_id IN ({placeholders})",
            packet_ids
        )
    log.info("Marked %d packet(s) as synced in local DB.", len(packet_ids))


def run_sync_cycle(conn: sqlite3.Connection, session: requests.Session):
    """
    Single end-to-end sync cycle:
      1. Fetch unsynced packets from SQLite.
      2. Verify checksum on each packet — skip corrupted ones.
      3. Send valid packets to the Cloud Ingestor.
      4. Mark ACKed packets as synced.
    """
    packets = fetch_unsynced_packets(conn)

    if not packets:
        log.info("No unsynced packets. Nothing to do.")
        return

    log.info("Found %d packet(s) to sync.", len(packets))

    # Integrity check — reject any tampered packets before sending
    valid_packets = []
    for p in packets:
        if verify_packet_checksum(p["payload_json"], p["checksum"]):
            valid_packets.append(p)
        else:
            log.error("Skipping packet [%s] — checksum failed.", p["packet_id"])

    if not valid_packets:
        log.error("No valid packets after integrity check. Aborting cycle.")
        return

    acked_ids = send_packets_to_cloud(session, valid_packets)
    mark_packets_synced(conn, acked_ids)


def run_forever():
    """Daemon loop. Connects to SQLite and syncs packets every SYNC_INTERVAL_SEC."""
    log.info(
        "NEXUS Sync Service starting.\n"
        "  Target   : %s\n"
        "  Interval : %ds\n"
        "  Batch    : %d packets max",
        CLOUD_INGESTOR_URL, SYNC_INTERVAL_SEC, MAX_BATCH_SIZE
    )

    conn    = sqlite3.connect(DB_PATH, check_same_thread=False)
    session = build_http_session()

    while True:
        try:
            log.info("─── Starting sync cycle ───")
            run_sync_cycle(conn, session)
        except Exception as e:
            log.error("Unhandled error in sync cycle: %s", e, exc_info=True)
        finally:
            log.info("Sync cycle complete. Next run in %ds.", SYNC_INTERVAL_SEC)
            time.sleep(SYNC_INTERVAL_SEC)


if __name__ == "__main__":
    run_forever()