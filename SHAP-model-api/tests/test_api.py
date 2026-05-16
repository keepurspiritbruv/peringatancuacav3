from src.main import SUPPORTED_BEACHES, TRUSTED_SIGNS


VALID_PAYLOAD = {
    "beach_location": "pantai_lampuuk",
    "lik_codes": ["wn-3"],
    "is_active_warning": False,
    "active_warning": [],
}

MULTISIGN_PAYLOAD = {
    "beach_location": "pantai_lampuuk",
    "lik_codes": ["wn-3", "wn-1", "wn-12"],
    "is_active_warning": False,
    "active_warning": [],
}

UNSAFE_BEACH_PAYLOAD = {
    "beach_location": "pantai_depok",
    "lik_codes": ["wn-3"],
    "is_active_warning": False,
    "active_warning": [],
}


def test_predict_valid(client):
    res = client.post("/predict", json=VALID_PAYLOAD)
    assert res.status_code == 200
    body = res.json()
    assert "active_warning" in body
    assert "sign_description" in body
    assert "community_characteristics" in body
    assert "action_recommendation" in body
    assert "triggered_lik_codes" in body


def test_predict_triggeres_lik_codes(client):
    res = client.post("/predict", json=VALID_PAYLOAD)
    assert res.status_code == 200
    body = res.json()
    assert "Wn-3" in body["triggered_lik_codes"]


def test_predict_untrusted_codes_filtered(client):
    payload = {
        "beach_location": "pantai_lampuuk",
        "lik_codes": ["wn-10", "wn-11", "wn-3"],
        "is_active_warning": False,
        "active_warning": [],
    }
    res = client.post("/predict", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert "Wn-10" not in body["triggered_lik_codes"]
    assert "Wn-11" not in body["triggered_lik_codes"]
    assert "Wn-3" in body["triggered_lik_codes"]


def test_predict_invalid_beach(client):
    payload = {**VALID_PAYLOAD, "beach_location": "pantai_bali"}
    res = client.post("/predict", json=payload)
    assert res.status_code == 400


def test_predict_empty_lik_codes(client):
    payload = {**VALID_PAYLOAD, "lik_codes": []}
    res = client.post("/predict", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["triggered_lik_codes"] == []
    assert "aman" in body["action_recommendation"].lower()


def test_predict_community_characteristics(client):
    res_safe = client.post("/predict", json=VALID_PAYLOAD)
    assert res_safe.json()["community_characteristics"] == "Actionable"

    res_unsafe = client.post("/predict", json=UNSAFE_BEACH_PAYLOAD)
    assert res_unsafe.json()["community_characteristics"] == "Low Actionable"


def test_predict_active_warning_merged(client):
    payload = {
        "beach_location": "pantai_lampuuk",
        "lik_codes": ["wn-3"],
        "is_active_warning": True,
        "active_warning": ["wn-1"],
    }
    res = client.post("/predict", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert "Wn-3" in body["triggered_lik_codes"]
    assert "Wn-1" in body["triggered_lik_codes"]


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "model_loaded": True}


def test_retrain_not_implemented(client):
    res = client.post("/retrain")
    assert res.status_code == 501


def test_model_info(client):
    res = client.get("/model/info")
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Hybrid SHAP Model"
    assert body["version"] == "1.1"
    assert body["type"] == "rule-based"
    assert body["supported_beaches"] == SUPPORTED_BEACHES
    assert body["trusted_signs"] == TRUSTED_SIGNS


def test_predict_response_has_explanation(client):
    payload = {
        "beach_location": "pantai_samas",
        "lik_codes": ["wn-4", "wn-7"],
        "is_active_warning": False,
        "active_warning": [],
    }
    res = client.post("/predict", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert "explanation" in body
    assert "summary_id" in body["explanation"]
    assert "summary_en" in body["explanation"]
    assert "contributions" in body["explanation"]
    assert "community_profile" in body["explanation"]
    assert len(body["explanation"]["contributions"]) > 0
    assert len(body["explanation"]["community_profile"]["factors"]) == 5


def test_predict_response_existing_fields_unchanged(client):
    res = client.post("/predict", json=VALID_PAYLOAD)
    body = res.json()
    assert "active_warning" in body
    assert "sign_description" in body
    assert "community_characteristics" in body
    assert "action_recommendation" in body
    assert "triggered_lik_codes" in body


def test_predict_explanation_empty_lik_codes(client):
    payload = {
        "beach_location": "pantai_lampuuk",
        "lik_codes": [],
        "is_active_warning": False,
        "active_warning": [],
    }
    res = client.post("/predict", json=payload)
    assert res.status_code == 200
    body = res.json()
    contributions = body["explanation"]["contributions"]
    lik_contributions = [c for c in contributions if c["category"] == "natural_sign"]
    assert len(lik_contributions) == 0
    assert "durasi penggunaan" in body["explanation"]["summary_id"].lower()


def test_predict_explanation_contributions_normalized(client):
    payload = {
        "beach_location": "pantai_samas",
        "lik_codes": ["wn-4"],
        "is_active_warning": False,
        "active_warning": [],
    }
    res = client.post("/predict", json=payload)
    body = res.json()
    total = sum(c["weight"] for c in body["explanation"]["contributions"])
    assert abs(total - 1.0) < 0.02
