import json
from models.event_model import Event

class MockConsumer:
    def consume(self):
        with open("mock_data/events.json", "r") as f:
            data = json.load(f)

        return [Event(**e) for e in data]