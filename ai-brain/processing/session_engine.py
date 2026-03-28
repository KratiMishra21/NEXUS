from typing import List, Dict
from collections import defaultdict
from models.event_model import Event

class SessionEngine:
    def build_sessions(self, events):
        sessions = {}

        for event in events:
            sid = event.session_id

            if sid not in sessions:
                sessions[sid] = {
                    "events": [],
                    "tenant_id": event.tenant_id
                }

            sessions[sid]["events"].append(event)

        for sid in sessions:
            sessions[sid]["events"] = sorted(
                sessions[sid]["events"],
                key=lambda x: x.timestamp
            )

        return sessions