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
    lik_codes: list[str]
    beach_location: str
    is_active_warning: bool = False
    active_warning: list[str] = []
    beach_id: Optional[int] = None
    beach_name: Optional[str] = None
    reported_codes: Optional[list[str]] = None
    bmkg_wind_speed: Optional[float] = None
    bmkg_wave_height: Optional[float] = None
    bmkg_rainfall: Optional[float] = None

BEACH_MAP = {
    "pantai_lampuuk": 1,
    "pantai_lhoknga": 2,
    "pantai_ulee_lheue": 3,
    "pantai_depok": 4,
    "pantai_samas": 5,
}

@app.post("/predict")
async def predict(req: PredictRequest):
    codes = req.reported_codes if req.reported_codes else req.lik_codes
    bid = req.beach_id if req.beach_id else BEACH_MAP.get(req.beach_location, 0)
    bname = req.beach_name if req.beach_name else req.beach_location

    engine = LikInferenceEngine()
    result = engine.evaluate(
        beach_id=bid,
        beach_name=bname,
        reported_codes=codes
    )
    return result
