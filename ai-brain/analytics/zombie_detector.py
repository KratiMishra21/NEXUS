class ZombieDetector:
    def detect(self, feature_usage, licensed_features):
        zombies = []

        for feature in licensed_features:
            if feature_usage.get(feature, 0) == 0:
                zombies.append(feature)

        return zombies