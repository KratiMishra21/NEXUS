from fastapi import FastAPI
from api.routes import router

app = FastAPI(title="InsightOS AI Brain")

app.include_router(router)