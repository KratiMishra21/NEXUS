from neo4j import GraphDatabase
from utils.config import Config

class Neo4jClient:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            Config.NEO4J_URI,
            auth=(Config.NEO4J_USER, Config.NEO4J_PASSWORD)
        )

    def close(self):
        self.driver.close()

    def execute(self, query, params=None):
        with self.driver.session() as session:
            return session.run(query, params or {})