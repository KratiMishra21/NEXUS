import sys, os
_infra = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_infra, "on_prem_vault"))
sys.path.insert(0, os.path.join(_infra, "cloud_ingestor"))