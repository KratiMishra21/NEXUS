from typing import Dict, List
from models.event_model import Event

class JourneyEngine:
    def build_journeys(self, sessions):
        journeys = []

        for sid, data in sessions.items():
            events = data["events"]
            tenant = data["tenant_id"]

            journey = [e.feature_id for e in events]

            journeys.append({
                "tenant_id": tenant,
                "journey": journey
            })

        return journeys