import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler


class ChurnPredictor:
    def __init__(self):
        self.model = LogisticRegression()
        self.scaler = StandardScaler()
        self.is_trained = False

    # 🔹 Time decay weighting (recent behavior importance)
    def _time_weight(self, index, total):
        if total == 0:
            return 0
        return (index + 1) / total

    # 🔹 Graph influence score (feature importance proxy)
    def _graph_score(self, journeys):
        freq = {}

        for j in journeys:
            for f in j:
                freq[f] = freq.get(f, 0) + 1

        total = sum(freq.values())
        if total == 0:
            return 0

        scores = [v / total for v in freq.values()]
        return float(np.mean(scores)) if scores else 0

    # 🔹 Core feature engineering
    def _extract_features(self, journeys, drop_offs, roi):
        total_sessions = len(journeys)

        if total_sessions == 0:
            return np.zeros((1, 6))

        # 📊 1. Avg Journey Length
        avg_length = float(np.mean([len(j) for j in journeys]))

        # 📉 2. Weighted Drop-off (time-aware)
        if drop_offs:
            weighted_drop = 0
            count = 0

            items = list(drop_offs.items())

            for i, (_, drop) in enumerate(items):
                w = self._time_weight(i, len(items))
                weighted_drop += drop * w
                count += 1

            weighted_drop = weighted_drop / count if count else 0
        else:
            weighted_drop = 0

        # 💰 3. Avg ROI
        avg_roi = float(np.mean(list(roi.values()))) if roi else 0

        # 🎯 4. Completion Rate (KYC → LOAN)
        completed = 0

        for j in journeys:
            try:
                if j.index("KYC") < j.index("LOAN"):
                    completed += 1
            except:
                continue

        completion_rate = completed / total_sessions if total_sessions else 0

        # 🔁 5. Engagement Consistency (low variance = stable)
        lengths = [len(j) for j in journeys]
        variance = np.var(lengths) if lengths else 0
        consistency = 1 / (1 + variance)

        # 🔗 6. Graph Influence Score
        graph_score = self._graph_score(journeys)

        return np.array([
            [
                avg_length,
                weighted_drop,
                avg_roi,
                completion_rate,
                consistency,
                graph_score
            ]
        ])

    # 🔹 Train model (synthetic but realistic patterns)
    def train(self):
        X = np.array([
            [5, 0.1, 0.5, 0.9, 0.8, 0.6],
            [2, 0.7, 0.1, 0.2, 0.3, 0.2],
            [4, 0.2, 0.4, 0.8, 0.7, 0.5],
            [1, 0.9, 0.05, 0.1, 0.2, 0.1],
            [6, 0.15, 0.6, 0.95, 0.9, 0.7],
            [2, 0.8, 0.2, 0.3, 0.4, 0.3]
        ])

        y = np.array([0, 1, 0, 1, 0, 1])  # 1 = churn

        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled, y)

        self.is_trained = True

    # 🔹 Predict churn + explanation
    def predict(self, journeys, drop_offs, roi):
        if not self.is_trained:
            raise Exception("Model not trained")

        features = self._extract_features(journeys, drop_offs, roi)
        scaled = self.scaler.transform(features)

        prob = float(self.model.predict_proba(scaled)[0][1])

        explanation = {
            "avg_journey_length": float(features[0][0]),
            "drop_off_score": float(features[0][1]),
            "avg_roi": float(features[0][2]),
            "completion_rate": float(features[0][3]),
            "consistency": float(features[0][4]),
            "graph_score": float(features[0][5])
        }

        return {
            "churn_probability": round(prob, 3),
            "features": explanation
        }