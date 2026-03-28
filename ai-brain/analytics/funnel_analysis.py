from collections import defaultdict

class FunnelAnalyzer:
    def calculate_drop_off(self, journeys):
        transition_counts = defaultdict(int)
        step_counts = defaultdict(int)

        for journey in journeys:
            for i in range(len(journey)):
                step_counts[journey[i]] += 1

                if i < len(journey) - 1:
                    pair = (journey[i], journey[i+1])
                    transition_counts[pair] += 1

        drop_offs = {}

        for (a, b), count in transition_counts.items():
            drop_rate = 1 - (count / step_counts[a])
            drop_offs[(a, b)] = round(drop_rate, 3)

        return drop_offs