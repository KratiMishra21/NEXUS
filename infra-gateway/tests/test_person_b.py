"""
NEXUS | infra-gateway/tests/test_person_b.py
Person B Test Suite
"""

import hashlib
import json
import sqlite3
import sys
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock, AsyncMock

# ─── Make imports work on Windows and Linux ───────────────────────────────────
import os as _os
# FIXED — matches your actual Windows folder names
_base = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
sys.path.insert(0, _os.path.join(_base, "on_prem_vault"))
sys.path.insert(0, _os.path.join(_base, "cloud_ingestor"))

# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 1: aggregator.py tests
# ══════════════════════════════════════════════════════════════════════════════

from aggregator import init_db, aggregate_events, run_aggregation_cycle

@pytest.fixture
def in_memory_db():
    conn = sqlite3.connect(":memory:")
    init_db(conn)
    return conn

def make_event(feature_id="LOAN_SUBMIT", event_type="FEATURE_SUCCESS", tenant_id="TNT-A1B2C3",
               duration_ms=150, error_code=None):
    return {
        "event_id":      str(uuid.uuid4()),
        "tenant_id":     tenant_id,
        "session_id":    str(uuid.uuid4()),
        "user_hash":     hashlib.sha256(str(uuid.uuid4()).encode()).hexdigest(),
        "event_type":    event_type,
        "feature_id":    feature_id,
        "feature_module": "LOAN_ORIGINATION",
        "timestamp":     datetime.now(timezone.utc).isoformat(),
        "duration_ms":   duration_ms,
        "error_code":    error_code,
    }

def insert_raw_events(conn, events):
    for e in events:
        conn.execute("""
            INSERT INTO raw_events (event_id, tenant_id, session_id, user_hash, event_type,
                                    feature_id, feature_module, timestamp, duration_ms, error_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (e["event_id"], e["tenant_id"], e["session_id"], e["user_hash"], e["event_type"],
              e["feature_id"], e["feature_module"], e["timestamp"], e["duration_ms"], e["error_code"]))
    conn.commit()


class TestDatabaseInit:
    def test_init_creates_raw_events_table(self, in_memory_db):
        cursor = in_memory_db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='raw_events'")
        assert cursor.fetchone() is not None

    def test_init_creates_insight_packets_table(self, in_memory_db):
        cursor = in_memory_db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='insight_packets'")
        assert cursor.fetchone() is not None

    def test_init_is_idempotent(self, in_memory_db):
        init_db(in_memory_db)
        cursor = in_memory_db.execute("SELECT COUNT(*) FROM raw_events")
        assert cursor.fetchone()[0] == 0


class TestAggregationLogic:
    def test_basic_aggregation_produces_packet(self):
        events = [make_event(event_type="FEATURE_SUCCESS") for _ in range(5)]
        packet = aggregate_events(events, "TNT-A1B2C3")
        assert packet is not None
        assert packet["tenant_id"] == "TNT-A1B2C3"
        assert len(packet["feature_summaries"]) == 1
        assert packet["feature_summaries"][0]["total_invocations"] == 5
        assert packet["feature_summaries"][0]["success_count"] == 5

    def test_empty_events_returns_none(self):
        assert aggregate_events([], "TNT-A1B2C3") is None

    def test_success_fail_abandon_counts(self):
        events = [
            make_event(event_type="FEATURE_SUCCESS"),
            make_event(event_type="FEATURE_SUCCESS"),
            make_event(event_type="FEATURE_FAIL", error_code="ERR_TIMEOUT"),
            make_event(event_type="FEATURE_ABANDON"),
        ]
        packet = aggregate_events(events, "TNT-A1B2C3")
        summary = packet["feature_summaries"][0]
        assert summary["success_count"] == 2
        assert summary["fail_count"] == 1
        assert summary["abandon_count"] == 1

    def test_average_duration_is_correct(self):
        events = [make_event(duration_ms=100), make_event(duration_ms=200), make_event(duration_ms=300)]
        packet = aggregate_events(events, "TNT-A1B2C3")
        assert packet["feature_summaries"][0]["avg_duration_ms"] == 200.0

    def test_unique_user_count_deduplicates(self):
        shared_hash = hashlib.sha256(b"user1").hexdigest()
        events = [make_event() for _ in range(3)]
        events[0]["user_hash"] = shared_hash
        events[1]["user_hash"] = shared_hash
        packet = aggregate_events(events, "TNT-A1B2C3")
        assert packet["feature_summaries"][0]["unique_user_count"] == 2

    def test_no_user_hashes_in_packet(self):
        events = [make_event() for _ in range(3)]
        packet_json = json.dumps(aggregate_events(events, "TNT-A1B2C3"))
        for event in events:
            assert event["user_hash"] not in packet_json
            assert event["session_id"] not in packet_json

    def test_error_distribution_is_aggregated(self):
        events = [
            make_event(event_type="FEATURE_FAIL", error_code="ERR_TIMEOUT"),
            make_event(event_type="FEATURE_FAIL", error_code="ERR_TIMEOUT"),
            make_event(event_type="FEATURE_FAIL", error_code="ERR_AUTH"),
        ]
        packet = aggregate_events(events, "TNT-A1B2C3")
        error_dist = packet["feature_summaries"][0]["error_distribution"]
        assert error_dist["ERR_TIMEOUT"] == 2
        assert error_dist["ERR_AUTH"] == 1

    def test_checksum_is_present_and_valid(self):
        packet = aggregate_events([make_event()], "TNT-A1B2C3")
        assert "checksum" in packet
        assert len(packet["checksum"]) == 64

    def test_multiple_features_produce_multiple_summaries(self):
        events = [
            make_event(feature_id="LOAN_SUBMIT"),
            make_event(feature_id="LOAN_SUBMIT"),
            make_event(feature_id="DOC_UPLOAD"),
            make_event(feature_id="CREDIT_CHECK"),
        ]
        packet = aggregate_events(events, "TNT-A1B2C3")
        assert len(packet["feature_summaries"]) == 3

    def test_period_start_and_end_are_correct(self):
        now = datetime.now(timezone.utc)
        older = (now - timedelta(hours=1)).isoformat()
        newer = now.isoformat()
        events = [make_event(), make_event()]
        events[0]["timestamp"] = older
        events[1]["timestamp"] = newer
        packet = aggregate_events(events, "TNT-A1B2C3")
        assert packet["period_start"] == older
        assert packet["period_end"] == newer


class TestMultiTenantIsolation:
    def test_tenant_events_are_aggregated_separately(self, in_memory_db):
        insert_raw_events(in_memory_db, [make_event(tenant_id="TNT-AAAAAA") for _ in range(3)])
        insert_raw_events(in_memory_db, [make_event(tenant_id="TNT-BBBBBB") for _ in range(5)])
        run_aggregation_cycle(in_memory_db)
        packets = in_memory_db.execute("SELECT tenant_id FROM insight_packets ORDER BY tenant_id").fetchall()
        assert len(packets) == 2
        ids = {p[0] for p in packets}
        assert "TNT-AAAAAA" in ids
        assert "TNT-BBBBBB" in ids

    def test_tenant_a_data_not_in_tenant_b_packet(self, in_memory_db):
        insert_raw_events(in_memory_db, [make_event(tenant_id="TNT-AAAAAA", feature_id="EXCLUSIVE_FEATURE")])
        insert_raw_events(in_memory_db, [make_event(tenant_id="TNT-BBBBBB", feature_id="COMMON_FEATURE")])
        run_aggregation_cycle(in_memory_db)
        row = in_memory_db.execute(
            "SELECT payload_json FROM insight_packets WHERE tenant_id = 'TNT-BBBBBB'"
        ).fetchone()
        assert row is not None
        assert "EXCLUSIVE_FEATURE" not in row[0]


class TestCircuitBreaker:
    def test_circuit_breaker_skips_aggregation_when_cpu_high(self, in_memory_db):
        insert_raw_events(in_memory_db, [make_event()])
        with patch("aggregator.get_cpu_usage", return_value=99.0):
            run_aggregation_cycle(in_memory_db)
        count = in_memory_db.execute("SELECT COUNT(*) FROM insight_packets").fetchone()[0]
        assert count == 0

    def test_circuit_breaker_allows_aggregation_when_cpu_low(self, in_memory_db):
        insert_raw_events(in_memory_db, [make_event()])
        with patch("aggregator.get_cpu_usage", return_value=0.5):
            run_aggregation_cycle(in_memory_db)
        count = in_memory_db.execute("SELECT COUNT(*) FROM insight_packets").fetchone()[0]
        assert count == 1


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 2: sync_service.py tests
# ══════════════════════════════════════════════════════════════════════════════

from sync_service import verify_packet_checksum


class TestChecksumVerification:
    def _make_packet_json(self):
        body = {
            "packet_id": str(uuid.uuid4()),
            "tenant_id": "TNT-A1B2C3",
            "period_start": "2024-01-01T00:00:00+00:00",
            "period_end": "2024-01-01T05:00:00+00:00",
            "schema_version": "1.0.0",
            "feature_summaries": [],
        }
        checksum = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
        body["checksum"] = checksum
        return json.dumps(body), checksum

    def test_valid_checksum_passes(self):
        packet_json, checksum = self._make_packet_json()
        assert verify_packet_checksum(packet_json, checksum) is True

    def test_tampered_packet_fails_checksum(self):
        packet_json, checksum = self._make_packet_json()
        tampered = packet_json.replace("TNT-A1B2C3", "TNT-HACKED")
        assert verify_packet_checksum(tampered, checksum) is False

    def test_wrong_checksum_fails(self):
        packet_json, _ = self._make_packet_json()
        assert verify_packet_checksum(packet_json, "a" * 64) is False

    def test_malformed_json_fails_gracefully(self):
        assert verify_packet_checksum("not-valid-json", "a" * 64) is False


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 3: kafka_config.py (FastAPI) tests
# ══════════════════════════════════════════════════════════════════════════════

from httpx import AsyncClient, ASGITransport

with patch("aiokafka.AIOKafkaProducer"), patch("aiokafka.admin.AIOKafkaAdminClient"):
    from kafka_config import app, API_KEY_SECRET


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {API_KEY_SECRET}"}


@pytest.mark.asyncio
class TestHealthEndpoint:
    async def test_health_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/health")
        assert resp.status_code == 200
        assert "status" in resp.json()


@pytest.mark.asyncio
class TestCloudEventsEndpoint:
    async def test_rejects_missing_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/events", json={"events": []})
        assert resp.status_code == 401

    async def test_rejects_bad_api_key(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/events",
                                     json={"events": []},
                                     headers={"Authorization": "Bearer wrong-key"})
        assert resp.status_code == 403

    async def test_rejects_invalid_tenant_id_format(self, auth_headers):
        bad_event = {
            "tenant_id": "NOT-VALID",
            "session_id": str(uuid.uuid4()),
            "event_type": "FEATURE_SUCCESS",
            "feature_id": "LOAN_SUBMIT",
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/events",
                                     json={"events": [bad_event]},
                                     headers=auth_headers)
        assert resp.status_code == 422

    async def test_rejects_invalid_event_type(self, auth_headers):
        bad_event = {
            "tenant_id": "TNT-A1B2C3",
            "session_id": str(uuid.uuid4()),
            "event_type": "MALICIOUS_INJECT",
            "feature_id": "LOAN_SUBMIT",
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/events",
                                     json={"events": [bad_event]},
                                     headers=auth_headers)
        assert resp.status_code == 422

    async def test_valid_batch_returns_202(self, auth_headers):
        valid_event = {
            "tenant_id": "TNT-A1B2C3",
            "session_id": str(uuid.uuid4()),
            "event_type": "FEATURE_SUCCESS",
            "feature_id": "LOAN_SUBMIT",
        }
        async def mock_produce(*args, **kwargs): return True
        async def mock_topics(*args, **kwargs): return None
        with patch("kafka_config.produce_to_kafka", side_effect=mock_produce), \
             patch("kafka_config.ensure_tenant_topics", side_effect=mock_topics):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/events",
                                         json={"events": [valid_event]},
                                         headers=auth_headers)
        assert resp.status_code == 202
        assert resp.json()["queued"] == 1