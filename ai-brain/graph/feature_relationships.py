class FeatureRelationshipEngine:
    def __init__(self, graph_builder):
        self.graph_builder = graph_builder

    def process_journeys(self, journeys):
        for journey in journeys:
            for i in range(len(journey) - 1):
                from_feature = journey[i]
                to_feature = journey[i + 1]

                self.graph_builder.create_transition(
                    from_feature,
                    to_feature
                )