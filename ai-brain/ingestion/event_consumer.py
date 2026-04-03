from typing import List
from models.event_model import Event

class EventConsumer:
    def consume(self) -> List[Event]:
        raise NotImplementedError("Consumer must implement consume method")