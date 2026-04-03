import logging
from utils.config import Config

def get_logger(name: str):
    logger = logging.getLogger(name)
    logger.setLevel(Config.LOG_LEVEL)

    if not logger.handlers:
        ch = logging.StreamHandler()
        formatter = logging.Formatter(
            "%(asctime)s | %(name)s | %(levelname)s | %(message)s"
        )
        ch.setFormatter(formatter)
        logger.addHandler(ch)

    return logger