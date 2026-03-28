class AdvisorBot:
    def generate_insights(self, analytics, simulation):
        insights = []

        # 🔹 Drop-off insights
        for (a, b), drop in analytics["drop_offs"].items():
            if drop > 0.3:
                insights.append(
                    f"High drop-off detected between {a} → {b} ({drop*100}%). Consider optimizing this transition."
                )

        # 🔹 Zombie features
        for feature in analytics["zombies"]:
            insights.append(
                f"Feature '{feature}' is licensed but unused. Consider removing or promoting it."
            )

        # 🔹 ROI insights
        for feature, value in analytics["roi"].items():
            if value < 0.1:
                insights.append(
                    f"Feature '{feature}' has low ROI ({value}). Investigate its effectiveness."
                )

        # 🔹 Simulation insights
        original = simulation["original"]
        new = simulation["new"]

        if new < original:
            insights.append(
                f"Simulation shows removing key steps reduces conversion from {original} to {new}. Avoid removing critical features."
            )

        return insights