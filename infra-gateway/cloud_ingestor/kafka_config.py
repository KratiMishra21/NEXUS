"""
NEXUS | infra-gateway/cloud-ingestor/kafka_config.py
Person B: "The Bridge" Engineer

CHANGE: Migrated from confluent-kafka (requires C build tools) to aiokafka
        (pure Python, works on Windows/Python 3.13 with no build dependencies).

PURPOSE:
  Configures the multi-tenant Apache Kafka pipeline for cloud-hosted tenants.
  This module defines the FastAPI ingest endpoint that:
    1. Receives InsightPackets from On-Prem Vaults (via sync_service.py).
    2. Receives raw real-time events from Cloud SDK deployments.
  All messages are routed to tenant-isolated Kafka topics.

MULTI-TENANT ISOLATION STRATEGY:
  Each tenant gets its own Kafka topic: nexus.events.<tenant_id>
  This ensures one tenant's data burst cannot starve another tenant's consumers.

FLOW (Cloud):
  Cloud SDK --> POST /api/v1/events --> AIOKafkaProducer --> nexus.events.TNT-XXXXXX
  On-Prem Vault --> POST /api/v1/ingest --> AIOKafkaProducer --> nexus.packets.TNT-XXXXXX
  Kafka Topics --> Person C's AI Brain consumers
"""

import json
import uuid
import logging
import os
import tempfile
import atexit
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from aiokafka import AIOKafkaProducer
from aiokafka.admin import AIOKafkaAdminClient, NewTopic
from aiokafka.errors import KafkaError, TopicAlreadyExistsError

# ─── Configuration ────────────────────────────────────────────────────────────

KAFKA_BOOTSTRAP_SERVERS = os.environ.get("NEXUS_KAFKA_BROKERS", "kafka:9092")
KAFKA_REPLICATION_FACTOR = int(os.environ.get("NEXUS_KAFKA_REPLICATION", 1))
KAFKA_RETENTION_MS = int(os.environ.get("NEXUS_KAFKA_RETENTION_MS", 604_800_000))
API_KEY_SECRET = os.environ.get("NEXUS_API_KEY", "dev-secret-key-replace-in-prod")

_tmp_cert_files = []

def _write_tmp_cert(content: str, suffix: str) -> str:
    f = tempfile.NamedTemporaryFile(mode='w', suffix=suffix, delete=False)
    f.write(content)
    f.flush()
    f.close()
    _tmp_cert_files.append(f.name)
    return f.name

def _cleanup_tmp_certs():
    for path in _tmp_cert_files:
        try:
            os.unlink(path)
        except Exception:
            pass

atexit.register(_cleanup_tmp_certs)

KAFKA_SSL_CAFILE   = os.environ.get("AIVEN_SSL_CAFILE", "")
KAFKA_SSL_CERTFILE = os.environ.get("AIVEN_SSL_CERTFILE", "")
KAFKA_SSL_KEYFILE  = os.environ.get("AIVEN_SSL_KEYFILE", "")

_CA_CONTENT   = os.environ.get("AIVEN_SSL_CA", "")
_CERT_CONTENT = os.environ.get("AIVEN_SSL_CERT", "")
_KEY_CONTENT  = os.environ.get("AIVEN_SSL_KEY", "")

if _CA_CONTENT and _CERT_CONTENT and _KEY_CONTENT:
    KAFKA_SSL_CAFILE   = _write_tmp_cert(_CA_CONTENT, ".pem")
    KAFKA_SSL_CERTFILE = _write_tmp_cert(_CERT_CONTENT, ".cert")
    KAFKA_SSL_KEYFILE  = _write_tmp_cert(_KEY_CONTENT, ".key")

KAFKA_USE_SSL = bool(KAFKA_SSL_CAFILE and KAFKA_SSL_CERTFILE and KAFKA_SSL_KEYFILE)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [NEXUS-INGESTOR] %(levelname)s - %(message)s"
)
log = logging.getLogger(__name__)

# ─── Kafka Producer (module-level singleton) ──────────────────────────────────

kafka_producer: Optional[AIOKafkaProducer] = None
created_topics: set[str] = set()


# ─── App Lifespan (startup / shutdown) ───────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start and stop the Kafka producer with the FastAPI app lifecycle.
    Retries up to 10 times with 3s delay — handles slow Kafka startup.
    """
    global kafka_producer
    import asyncio, ssl as _ssl

    ssl_ctx = None
    if KAFKA_USE_SSL:
        ssl_ctx = _ssl.create_default_context()
        ssl_ctx.load_verify_locations(cafile=KAFKA_SSL_CAFILE)
        ssl_ctx.load_cert_chain(certfile=KAFKA_SSL_CERTFILE, keyfile=KAFKA_SSL_KEYFILE)
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_REQUIRED
        log.info("SSL context built from %s", KAFKA_SSL_CAFILE)

    for attempt in range(1, 11):
        try:
            kwargs = dict(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
                acks="all",
                enable_idempotence=True,
                linger_ms=50,
            )
            if ssl_ctx:
                kwargs["security_protocol"] = "SSL"
                kwargs["ssl_context"] = ssl_ctx
            producer = AIOKafkaProducer(**kwargs)
            await producer.start()
            kafka_producer = producer
            log.info("AIOKafka producer connected to %s (attempt %d)", KAFKA_BOOTSTRAP_SERVERS, attempt)
            break
        except Exception as e:
            log.warning("Kafka connect attempt %d/10 failed: %s. Retrying in 3s...", attempt, e)
            await asyncio.sleep(3)
    else:
        log.error("All 10 Kafka connect attempts failed. Running in degraded mode.")
        kafka_producer = None
    yield
    if kafka_producer:
        await kafka_producer.stop()
        log.info("Kafka producer stopped.")


app = FastAPI(
    title="NEXUS Cloud Ingestor",
    description="Receives telemetry events and InsightPackets, routes to tenant-isolated Kafka topics.",
    version="1.0.0",
    docs_url="/api/docs",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ─── Topic Management ─────────────────────────────────────────────────────────

async def ensure_tenant_topics(tenant_id: str):
    """
    Auto-creates tenant-isolated Kafka topics if they don't exist.
    Uses an in-memory cache so we only hit the admin API once per tenant per run.
    Topics: nexus.events.<tenant_id> and nexus.packets.<tenant_id>
    """
    if tenant_id in created_topics:
        return

    topics_to_create = [
        NewTopic(name=f"nexus.events.{tenant_id}", num_partitions=6,
                 replication_factor=KAFKA_REPLICATION_FACTOR),
        NewTopic(name=f"nexus.packets.{tenant_id}", num_partitions=3,
                 replication_factor=KAFKA_REPLICATION_FACTOR),
    ]
    admin_kwargs = dict(bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS)
    if KAFKA_USE_SSL:
        import ssl
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.load_verify_locations(cafile=KAFKA_SSL_CAFILE)
        ssl_ctx.load_cert_chain(certfile=KAFKA_SSL_CERTFILE, keyfile=KAFKA_SSL_KEYFILE)
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_REQUIRED
        admin_kwargs.update(dict(
            security_protocol="SSL",
            ssl_context=ssl_ctx,
        ))
    admin = AIOKafkaAdminClient(**admin_kwargs)
    try:
        await admin.start()
        await admin.create_topics(topics_to_create)
        log.info("Created Kafka topics for tenant %s", tenant_id)
        created_topics.add(tenant_id)
    except TopicAlreadyExistsError:
        created_topics.add(tenant_id)
    except Exception as e:
        log.warning("Could not create topics for %s: %s", tenant_id, e)
    finally:
        await admin.close()


async def produce_to_kafka(topic: str, key: str, payload: dict) -> bool:
    """Sends a message to a Kafka topic asynchronously. Returns True on success."""
    if kafka_producer is None:
        log.error("Kafka producer not available.")
        return False
    try:
        await kafka_producer.send_and_wait(topic, value=payload, key=key)
        return True
    except KafkaError as e:
        log.error("Kafka produce error for topic %s: %s", topic, e)
        return False


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class TelemetryEvent(BaseModel):
    """Single raw telemetry event from a Cloud-deployed SDK (Person A)."""
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str = Field(..., pattern=r"^TNT-[A-Z0-9]{6}$")
    session_id: str
    user_hash: Optional[str] = None
    event_type: str = Field(..., pattern=r"^(FEATURE_OPEN|FEATURE_SUCCESS|FEATURE_FAIL|FEATURE_ABANDON|PAGE_VIEW|API_CALL)$")
    feature_id: str
    feature_module: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    duration_ms: Optional[int] = None
    deployment_type: str = "CLOUD"
    geo_region: Optional[str] = None
    error_code: Optional[str] = None
    metadata: Optional[dict] = None

    @field_validator("user_hash")
    @classmethod
    def validate_user_hash(cls, v):
        if v and len(v) != 64:
            raise ValueError("user_hash must be a 64-character SHA-256 hex string")
        return v


class EventBatchRequest(BaseModel):
    events: list[TelemetryEvent]
    sdk_version: Optional[str] = None


class InsightPacketBatch(BaseModel):
    batch_id: str
    sent_at: str
    packet_count: int
    packets: list[dict]


class IngestResponse(BaseModel):
    acknowledged_packet_ids: list[str]
    rejected_count: int
    message: str


# ─── Authentication ───────────────────────────────────────────────────────────

def verify_api_key(authorization: Optional[str]):
    """Simple Bearer token check."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    if token != API_KEY_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")


# ─── API Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "service": "NEXUS Cloud Ingestor",
        "version": "1.0.0",
        "status": "running",
        "docs": "/api/docs",
        "health": "/health",
        "endpoints": {
            "ingest_cloud_events": "POST /api/v1/events",
            "ingest_onprem_packets": "POST /api/v1/ingest",
        }
    }


@app.get("/health")
async def health_check():
    kafka_ok = kafka_producer is not None
    return {
        "status": "healthy" if kafka_ok else "degraded",
        "kafka_connected": kafka_ok,
        "kafka_broker": KAFKA_BOOTSTRAP_SERVERS,
        "ssl_enabled": KAFKA_USE_SSL,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/events", status_code=202)
async def ingest_cloud_events(
    batch: EventBatchRequest,
    authorization: Optional[str] = Header(None),
):
    """
    For CLOUD-deployed SDKs (Person A).
    Routes each event to: nexus.events.<tenant_id>
    """
    verify_api_key(authorization)
    queued, failed = 0, 0

    tenant_ids = {e.tenant_id for e in batch.events}
    for tenant_id in tenant_ids:
        await ensure_tenant_topics(tenant_id)

    for event in batch.events:
        topic = f"nexus.events.{event.tenant_id}"
        success = await produce_to_kafka(topic, key=event.session_id, payload=event.model_dump())
        if success:
            queued += 1
        else:
            failed += 1

    log.info("Cloud event batch: %d queued, %d failed.", queued, failed)
    return {"queued": queued, "failed": failed, "message": "Batch processed"}


@app.post("/api/v1/ingest", response_model=IngestResponse)
async def ingest_onprem_packets(
    batch: InsightPacketBatch,
    authorization: Optional[str] = Header(None),
):
    """
    For On-Prem Vault sync_service.py.
    Routes InsightPackets to: nexus.packets.<tenant_id>
    Returns acknowledged_packet_ids so sync_service can mark them synced locally.
    """
    verify_api_key(authorization)
    acknowledged_ids, rejected_count = [], 0

    for packet in batch.packets:
        tenant_id = packet.get("tenant_id")
        packet_id = packet.get("packet_id")

        if not tenant_id or not packet_id:
            log.warning("Packet missing tenant_id or packet_id. Rejecting.")
            rejected_count += 1
            continue

        await ensure_tenant_topics(tenant_id)
        topic = f"nexus.packets.{tenant_id}"
        success = await produce_to_kafka(topic, key=packet_id, payload=packet)

        if success:
            acknowledged_ids.append(packet_id)
        else:
            rejected_count += 1

    log.info("On-prem batch [%s]: %d ACKed, %d rejected.", batch.batch_id, len(acknowledged_ids), rejected_count)
    return IngestResponse(
        acknowledged_packet_ids=acknowledged_ids,
        rejected_count=rejected_count,
        message=f"Processed {len(batch.packets)} packets."
    )