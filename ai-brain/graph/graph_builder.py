class GraphBuilder:
    def __init__(self, neo4j_client):
        self.client = neo4j_client

    def create_feature(self, feature_id):
        query = """
        MERGE (f:Feature {id: $feature_id})
        """
        self.client.execute(query, {"feature_id": feature_id})

    def create_transition(self, from_feature, to_feature):
        query = """
        MERGE (a:Feature {id: $from_feature})
        MERGE (b:Feature {id: $to_feature})
        MERGE (a)-[r:TRANSITION]->(b)
        ON CREATE SET r.count = 1
        ON MATCH SET r.count = r.count + 1
        """
        self.client.execute(query, {
            "from_feature": from_feature,
            "to_feature": to_feature
        })