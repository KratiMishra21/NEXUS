class ROICalculator:
    def calculate(self, feature_usage, feature_cost, conversion_value=1.0):
        roi = {}

        for feature, usage in feature_usage.items():
            cost = feature_cost.get(feature, 1)

            if cost == 0:
                roi[feature] = 0
            else:
                roi[feature] = round((usage * conversion_value) / cost, 3)

        return roi