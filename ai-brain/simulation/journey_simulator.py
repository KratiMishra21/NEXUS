class JourneySimulator:
    def simulate_removal(self, journeys, feature_to_remove):
        modified_journeys = []

        for journey in journeys:
            new_journey = [f for f in journey if f != feature_to_remove]
            if new_journey:
                modified_journeys.append(new_journey)

        return modified_journeys

    def simulate_conversion_rate(self, journeys):
        total_sessions = len(journeys)
        completed = 0

        for journey in journeys:
            try:
                kyc_index = journey.index("KYC")
                loan_index = journey.index("LOAN")

                if kyc_index < loan_index:
                    completed += 1
            except ValueError:
                continue

        if total_sessions == 0:
            return 0

        return round(completed / total_sessions, 3)