import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from contextlib import asynccontextmanager
from engine.inference_engine import InferenceEngine as LikInferenceEngine
import sqlite3
import json

DB_PATH = os.getenv("DB_PATH", "/app/data/disaster.db")

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_path = DB_PATH
    yield

app = FastAPI(title="LIK Inference Engine API", version="1.0.0")

@app.get("/health")
async def health():
    return {"status": "ok", "service": "lik-inference-engine"}

from pydantic import BaseModel
from typing import Optional

class PredictRequest(BaseModel):
    beach_id: int
    beach_name: str
    reported_codes: list[str]
    bmkg_wind_speed: Optional[float] = None
    bmkg_wave_height: Optional[float] = None
    bmkg_rainfall: Optional[float] = None

@app.post("/predict")
async def predict(req: PredictRequest):
    engine = LikInferenceEngine()
    result = engine.evaluate(
        beach_id=req.beach_id,
        beach_name=req.beach_name,
        reported_codes=req.reported_codes
    )
    return result
