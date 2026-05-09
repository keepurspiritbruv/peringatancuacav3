import pytest
from fastapi.testclient import TestClient
from src.main import app
from src.engine.inference_engine import InferenceEngine


@pytest.fixture
def engine():
    return InferenceEngine()


@pytest.fixture
def client():
    return TestClient(app)
