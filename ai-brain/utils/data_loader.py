import json

class DataLoader:
    @staticmethod
    def load_json(path):
        with open(path, "r") as f:
            return json.load(f)