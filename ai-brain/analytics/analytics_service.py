from utils.data_loader import DataLoader

class AnalyticsService:
    def __init__(self, funnel_analyzer, zombie_detector, roi_calculator):
        self.funnel_analyzer = funnel_analyzer
        self.zombie_detector = zombie_detector
        self.roi_calculator = roi_calculator

        config = DataLoader.load_json("mock_data/features.json")

        self.licensed_features = config["licensed_features"]
        self.feature_cost = config["feature_cost"]

    def run(self, journeys):
        drop_offs = self.funnel_analyzer.calculate_drop_off(journeys)

        feature_usage = {}
        for journey in journeys:
            for f in journey:
                feature_usage[f] = feature_usage.get(f, 0) + 1

        zombies = self.zombie_detector.detect(feature_usage, self.licensed_features)
        roi = self.roi_calculator.calculate(feature_usage, self.feature_cost)

        return {
            "drop_offs": drop_offs,
            "zombies": zombies,
            "roi": roi
        }
    
    def run_multi_tenant(self, journeys):
        tenant_journeys = {}

        for item in journeys:
            tenant = item["tenant_id"]
            journey = item["journey"]

            tenant_journeys.setdefault(tenant, []).append(journey)

        tenant_results = {}

        for tenant, t_journeys in tenant_journeys.items():
            tenant_results[tenant] = {
                "analytics": self.run(t_journeys),
                "journeys": t_journeys
            }

        return tenant_results