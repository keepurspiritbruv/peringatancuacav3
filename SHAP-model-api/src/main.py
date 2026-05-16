from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from .engine.inference_engine import InferenceEngine

SUPPORTED_BEACHES = [
    "pantai_lampuuk",
    "pantai_lhoknga",
    "pantai_ulee_lheue",
    "pantai_depok",
    "pantai_samas",
]

TRUSTED_SIGNS = [
    "Wn-1", "Wn-2", "Wn-3", "Wn-4", "Wn-5",
    "Wn-6", "Wn-7", "Wn-8", "Wn-9", "Wn-13",
]

app = FastAPI(title="Hybrid SHAP Model API", version="1.1")
engine = InferenceEngine()

class PredictionInput(BaseModel):
    beach_location: str = Field(..., description="Lokasi pantai (contoh: 'pantai_lampuuk')")
    lik_codes: list[str] = Field(..., description="Daftar kode tanda alam (contoh: ['wn-1', 'wn-3'])")
    is_active_warning: bool = Field(..., description="Apakah ada tanda alam yang sedang aktif aktif")
    active_warning: list[str] = Field(..., description="Daftar kode tanda alam yang sedang aktif(contoh: ['wn-1', 'wn-3'])")

    class Config:
        json_schema_extra = {
            "example": {
                "beach_location": "pantai_lampuuk",
                "lik_codes": ["wn-1", "wn-7"],
                "is_active_warning": True,
                "active_warning": ["wn-8"]
            }
        }

@app.get("/")
def home():
    return {"message": "Sistem Peringatan Dini Nelayan Berbasis Pengetahuan Lokal aktif."}

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": True}

@app.post("/retrain")
def retrain():
    raise HTTPException(status_code=501, detail="Retrain not yet implemented")

@app.get("/model/info")
def model_info():
    return {
        "name": "Hybrid SHAP Model",
        "version": "1.1",
        "type": "rule-based",
        "supported_beaches": SUPPORTED_BEACHES,
        "trusted_signs": TRUSTED_SIGNS,
    }

@app.post("/predict")
def predict_risk(input_data: PredictionInput):
    """
    Endpoint untuk mendapatkan analisis risiko perilaku dan validitas tanda alam.
    """
    system_input = {"lik_codes": input_data.lik_codes, "is_active_warning": input_data.is_active_warning, "active_warning": input_data.active_warning}

    beach_key = input_data.beach_location.lower()
    rules_attr = f"{beach_key}_rules"

    if beach_key not in SUPPORTED_BEACHES:
        raise HTTPException(status_code=400, detail=f"Lokasi pantai tidak valid. Pilih salah satu: {', '.join(SUPPORTED_BEACHES)}.")

    community_rules = {"rules": getattr(engine, rules_attr)}
    data_for_engine = system_input | community_rules
    
    try:
        result = engine.predict(data_for_engine)
        explanation = engine.compute_contributions(result, community_rules["rules"], beach_key)
        result["explanation"] = explanation
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))