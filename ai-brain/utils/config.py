import os

class Config:
    APP_NAME = "NEXUS"
    VERSION = "1.0.0"

    KAFKA_BROKER = os.getenv("KAFKA_BROKER", "localhost:9092")

    NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
    NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")

    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")