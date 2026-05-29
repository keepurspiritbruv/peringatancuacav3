# SHAP Explainability Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-prediction SHAP explainability to every alert: weighted contributions, community profile breakdown, BMKG cross-validation, and layered frontend display.

**Architecture:** The ML service gains a `compute_contributions()` method that produces weighted factor breakdowns. The existing `/predict` response gets an `explanation` field (backward-compatible). The backend adds a new `GET /api/alerts/:id/explanation` endpoint. The frontend adds a recharts bar chart, community profile table, and cross-validation badge behind an expandable "Kenapa?" section on alert cards.

**Tech Stack:** Python (FastAPI, pandas, pytest) | TypeScript (Hono, Drizzle ORM, bun:test) | Next.js 16 (React 19, recharts, Tailwind v4, shadcn/ui, lucide-react)

---

### Task 1: ML Service — Add LIK sign label/English mappings

**Files:**
- Modify: `SHAP-model-api/src/engine/inference_engine.py:54-71`

- [ ] **Step 1: Add label mappings to `get_lik_sign_description`**

In `SHAP-model-api/src/engine/inference_engine.py`, update `get_lik_sign_description` to return label_id, label_en, and detail fields for each LIK code. Replace the existing method (lines 54-71) with:

```python
    LIK_LABELS = {
        "wn-1": {"label_id": "Awan Turun", "label_en": "Falling Clouds", "detail_id": "Awan tampak turun ke bawah membentuk gumpalan 3 kali", "detail_en": "Clouds appear to descend forming clusters 3 times"},
        "wn-2": {"label_id": "Awan Bergumpal", "label_en": "Clustered Clouds", "detail_id": "Awan bergumpal dalam beberapa kelompok yang tampak saling mendekat atau menyatu", "detail_en": "Clouds cluster in groups that appear to approach or merge"},
        "wn-3": {"label_id": "Kilat", "label_en": "Lightning", "detail_id": "Kilat muncul di salah satu sisi langit ataupun saling berbalas antara dua sisi", "detail_en": "Lightning appears on one side of the sky or flashes between two sides"},
        "wn-4": {"label_id": "Ombak Besar", "label_en": "High Waves", "detail_id": "Gelombang laut berubah pola dari kecil dan sering hingga besar dan rapat", "detail_en": "Ocean waves change pattern from small and frequent to large and dense"},
        "wn-5": {"label_id": "Lumba-lumba Mendekat", "label_en": "Approaching Dolphins", "detail_id": "Lumba-lumba mendekati perahu, seolah menggiring perahu", "detail_en": "Dolphins approach the boat, seemingly herding it"},
        "wn-6": {"label_id": "Burung Camar", "label_en": "Seagulls", "detail_id": "Burung camar terbang tergesa sambil bersuara keras", "detail_en": "Seagulls fly hastily while calling loudly"},
        "wn-7": {"label_id": "Peralihan Angin", "label_en": "Wind Transition", "detail_id": "Pada masa peralihan angin barat ke angin timur", "detail_en": "During the transition from west wind to east wind"},
        "wn-8": {"label_id": "Langit Merah", "label_en": "Red Sky", "detail_id": "Langit mendung namun tidak terlalu gelap", "detail_en": "Sky is overcast but not too dark"},
        "wn-9": {"label_id": "Bintang Redup", "label_en": "Dim Stars", "detail_id": "Hujan atau langit tertutup awan tebal, saat angin timur", "detail_en": "Rain or sky covered by thick clouds during east wind"},
        "wn-13": {"label_id": "Ikan Naik", "label_en": "Fish Surfacing", "detail_id": "Bintang tidak terlihat di malam hari, saat angin timur", "detail_en": "Stars not visible at night during east wind"},
    }

    def get_lik_sign_info(self, lik_codes: list) -> list:
        """Return list of dicts with code, labels, and details for each detected LIK sign."""
        return [
            {"code": code.upper(), **self.LIK_LABELS[code.lower()]}
            for code in lik_codes
            if code.lower() in self.LIK_LABELS
        ]
```

- [ ] **Step 2: Update `predict()` to use new method name**

In the `predict()` method (line 134), replace `self.get_lik_sign_description([trigger_code])[0]['description']` with `self.get_lik_sign_info([trigger_code])[0]['detail_id']`.

Replace the Logic 3 block (lines 138-151) to use `get_lik_sign_info`:

```python
        # ---------------------------------------------------------
        # Logic 3: Get Sign Description
        # ---------------------------------------------------------
        desc_list = self.get_lik_sign_info(combined_codes)

        extracted_descriptions = []
        if desc_list:
            for item in desc_list:
                extracted_descriptions.append(" - ".join([str(item["code"]), str(item["detail_id"])]))

        sign_description_str = " | ".join(extracted_descriptions) if extracted_descriptions else "Tidak ada deskripsi tanda alam yang valid."
```

Also on line 134, change `self.get_lik_sign_description([trigger_code])[0]['description']` to `self.get_lik_sign_info([trigger_code])[0]['detail_id']`.

- [ ] **Step 3: Run existing tests to verify nothing broke**

Run: `cd SHAP-model-api && python -m pytest tests/ -v`
Expected: All 22 existing tests pass (12 inference + 10 API)

- [ ] **Step 4: Commit**

```bash
git add SHAP-model-api/src/engine/inference_engine.py
git commit -m "feat(ml): add LIK sign label/English mappings to inference engine"
```

---

### Task 2: ML Service — Add `compute_contributions()` method

**Files:**
- Modify: `SHAP-model-api/src/engine/inference_engine.py` (append new method after `predict`)
- Test: `SHAP-model-api/tests/test_inference.py` (append new test class)

- [ ] **Step 1: Write the failing test for `compute_contributions`**

Append to `SHAP-model-api/tests/test_inference.py`:

```python
class TestComputeContributions:

    def test_contributions_with_unsafe_beach(self, engine):
        data = {
            "lik_codes": ["wn-4", "wn-7"],
            "active_warning": [],
            "rules": engine.pantai_samas_rules,
        }
        prediction = engine.predict(data)
        contributions = engine.compute_contributions(prediction, engine.pantai_samas_rules)
        assert "contributions" in contributions
        assert "community_profile" in contributions
        assert "summary_id" in contributions
        assert "summary_en" in contributions
        assert len(contributions["contributions"]) > 0
        total_weight = sum(c["weight"] for c in contributions["contributions"])
        assert abs(total_weight - 1.0) < 0.01

    def test_contributions_with_safe_beach(self, engine):
        data = {
            "lik_codes": ["wn-2"],
            "active_warning": [],
            "rules": engine.pantai_lampuuk_rules,
        }
        prediction = engine.predict(data)
        contributions = engine.compute_contributions(prediction, engine.pantai_lampuuk_rules)
        assert len(contributions["contributions"]) > 0
        community_factors = [c for c in contributions["contributions"] if c["category"] == "community"]
        safe_factors = [c for c in community_factors if c["direction"] == "neutral"]
        assert len(safe_factors) == 5

    def test_contributions_no_lik_codes(self, engine):
        data = {
            "lik_codes": [],
            "active_warning": [],
            "rules": engine.pantai_samas_rules,
        }
        prediction = engine.predict(data)
        contributions = engine.compute_contributions(prediction, engine.pantai_samas_rules)
        natural_signs = [c for c in contributions["contributions"] if c["category"] == "natural_sign"]
        assert len(natural_signs) == 0

    def test_contributions_sorted_by_weight_desc(self, engine):
        data = {
            "lik_codes": ["wn-4", "wn-7"],
            "active_warning": [],
            "rules": engine.pantai_samas_rules,
        }
        prediction = engine.predict(data)
        contributions = engine.compute_contributions(prediction, engine.pantai_samas_rules)
        weights = [c["weight"] for c in contributions["contributions"]]
        assert weights == sorted(weights, reverse=True)

    def test_community_profile_has_all_five_factors(self, engine):
        data = {
            "lik_codes": ["wn-3"],
            "active_warning": [],
            "rules": engine.pantai_depok_rules,
        }
        prediction = engine.predict(data)
        contributions = engine.compute_contributions(prediction, engine.pantai_depok_rules)
        profile = contributions["community_profile"]
        assert profile["overall"] == "Unsafe"
        assert len(profile["factors"]) == 5
        factor_keys = [f["key"] for f in profile["factors"]]
        assert set(factor_keys) == {"interaction", "frequency", "duration", "lik_combination", "experience"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd SHAP-model-api && python -m pytest tests/test_inference.py::TestComputeContributions -v`
Expected: FAIL — `AttributeError: 'InferenceEngine' object has no attribute 'compute_contributions'`

- [ ] **Step 3: Implement `compute_contributions()`**

Append this method to the `InferenceEngine` class in `SHAP-model-api/src/engine/inference_engine.py` (after the `predict` method):

```python
    ESCALATION_WEIGHTS = {
        0: 0.3,
        1: 0.6,
        2: 0.9,
    }

    COMMUNITY_FACTOR_META = {
        "interaction": {
            "label_id": "Interaksi Bencana",
            "label_en": "Disaster Interaction",
            "rule_key": "Level of Interaction with Disaster Status",
            "detail_safe_id": "Cukup berinteraksi dengan bencana",
            "detail_safe_en": "Adequate disaster interaction",
            "detail_unsafe_id": "Kurang berinteraksi dengan bencana",
            "detail_unsafe_en": "Limited disaster interaction",
        },
        "frequency": {
            "label_id": "Frekuensi Pelaporan",
            "label_en": "Reporting Frequency",
            "rule_key": "Frequency of Usage Status",
            "detail_safe_id": "Sering menggunakan sistem",
            "detail_safe_en": "Frequently uses the system",
            "detail_unsafe_id": "Jarang menggunakan sistem",
            "detail_unsafe_en": "Rarely uses the system",
        },
        "duration": {
            "label_id": "Durasi Penggunaan",
            "label_en": "Usage Duration",
            "rule_key": "Usage Duration Status",
            "detail_safe_id": "Lama menggunakan sistem",
            "detail_safe_en": "Long usage duration",
            "detail_unsafe_id": "Durasi penggunaan singkat",
            "detail_unsafe_en": "Short usage duration",
        },
        "lik_combination": {
            "label_id": "Kombinasi LIK",
            "label_en": "LIK Combination",
            "rule_key": "Number of Known LIK Status",
            "detail_safe_id": "Cukup mengenal tanda alam",
            "detail_safe_en": "Adequate knowledge of natural signs",
            "detail_unsafe_id": "Kurang mengenal tanda alam",
            "detail_unsafe_en": "Limited knowledge of natural signs",
        },
        "experience": {
            "label_id": "Pengalaman Bencana",
            "label_en": "Disaster Experience",
            "rule_key": "Number of Experience with Disaster Status",
            "detail_safe_id": "Pengalaman bencana memadai",
            "detail_safe_en": "Adequate disaster experience",
            "detail_unsafe_id": "Pengalaman bencana terbatas",
            "detail_unsafe_en": "Limited disaster experience",
        },
    }

    def compute_contributions(self, prediction: dict, rules: dict) -> dict:
        import pandas as pd
        from pathlib import Path

        contributions = []

        # Natural sign contributions from triggered LIK codes
        triggered_codes = prediction.get("triggered_lik_codes", [])
        csv_path = Path(__file__).parent / 'lik_filtered_action_taken.csv'
        df_action = pd.read_csv(csv_path)
        escalation_map = {
            'berhati-hati / tingkatkan kewaspadaan': 0,
            'siaga penuh / amankan alat tangkap': 1,
            'sesuaikan jadwal melaut': 2,
        }

        for code in triggered_codes:
            sign_info = self.get_lik_sign_info([code])
            if not sign_info:
                continue
            info = sign_info[0]
            row = df_action[df_action['LIK'] == code]
            if row.empty:
                continue
            action_str = row.iloc[0]['most_action_taken'].lower()
            level = escalation_map.get(action_str, 0)
            raw_weight = self.ESCALATION_WEIGHTS.get(level, 0.3)
            contributions.append({
                "factor": code,
                "label_id": info["label_id"],
                "label_en": info["label_en"],
                "category": "natural_sign",
                "weight": raw_weight,
                "direction": "increases_risk",
                "detail_id": info["detail_id"],
                "detail_en": info["detail_en"],
            })

        # Community factor contributions
        community_profile_factors = []
        beach_slug = None
        for row in self.df_community.itertuples():
            if self._beach_matches_rules(row, rules):
                beach_slug = getattr(row, 'Mapped Beach', None).replace(" ", "_") if hasattr(row, 'Mapped Beach') else None
                break

        for key, meta in self.COMMUNITY_FACTOR_META.items():
            status = rules.get(meta["rule_key"], "Safe")
            is_unsafe = status == "Unsafe"
            raw_weight = 0.5 if is_unsafe else 0.0
            value = self._get_community_value(beach_slug, key) if beach_slug else 0

            contributions.append({
                "factor": key,
                "label_id": meta["label_id"],
                "label_en": meta["label_en"],
                "category": "community",
                "weight": raw_weight,
                "direction": "increases_risk" if is_unsafe else "neutral",
                "detail_id": meta["detail_unsafe_id"] if is_unsafe else meta["detail_safe_id"],
                "detail_en": meta["detail_unsafe_en"] if is_unsafe else meta["detail_safe_en"],
            })

            community_profile_factors.append({
                "key": key,
                "label_id": meta["label_id"],
                "label_en": meta["label_en"],
                "value": value,
                "status": status,
                "detail_id": meta["detail_unsafe_id"] if is_unsafe else meta["detail_safe_id"],
                "detail_en": meta["detail_unsafe_en"] if is_unsafe else meta["detail_safe_en"],
            })

        # Normalize weights
        total = sum(c["weight"] for c in contributions)
        if total > 0:
            for c in contributions:
                c["weight"] = round(c["weight"] / total, 2)

        # Sort by weight descending
        contributions.sort(key=lambda x: x["weight"], reverse=True)

        # Generate NL summaries
        summary_parts_id = []
        summary_parts_en = []
        for c in contributions[:5]:
            if c["weight"] > 0:
                summary_parts_id.append(f"{c['label_id'].lower()} ({int(c['weight'] * 100)}%)")
                summary_parts_en.append(f"{c['label_en'].lower()} ({int(c['weight'] * 100)}%)")

        summary_id = f"Bahaya karena {', '.join(summary_parts_id)}" if summary_parts_id else "Tidak ada faktor risiko terdeteksi."
        summary_en = f"Danger due to {', '.join(summary_parts_en)}" if summary_parts_en else "No risk factors detected."

        overall = rules.get("Overall Category", "Safe")

        return {
            "summary_id": summary_id,
            "summary_en": summary_en,
            "contributions": contributions,
            "community_profile": {
                "beach": beach_slug.replace(" ", "_") if beach_slug else "unknown",
                "overall": overall,
                "factors": community_profile_factors,
            },
        }

    def _beach_matches_rules(self, csv_row, rules: dict) -> bool:
        row_category = getattr(csv_row, 'Overall Category', None)
        rules_category = rules.get('Overall Category', None)
        if row_category and rules_category and row_category == rules_category:
            row_interaction = getattr(csv_row, 'Level of Interaction with Disaster Status', None)
            rules_interaction = rules.get('Level of Interaction with Disaster Status', None)
            if row_interaction and rules_interaction and row_interaction == rules_interaction:
                return True
        return False

    def _get_community_value(self, beach_slug: str, factor_key: str) -> float:
        csv_col_map = {
            "interaction": "Level of Interaction with Disaster",
            "frequency": "Frequency of Usage (max) (in month)",
            "duration": "Usage Duration",
            "lik_combination": "Number of LIK Combination",
            "experience": "Number of Experience with Disaster",
        }
        col_name = csv_col_map.get(factor_key)
        if not col_name:
            return 0.0
        beach_name = beach_slug.replace("_", " ")
        row = self.df_community[self.df_community['Mapped Beach'] == beach_name]
        if row.empty:
            return 0.0
        return float(row.iloc[0][col_name]) if col_name in row.columns else 0.0
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd SHAP-model-api && python -m pytest tests/test_inference.py::TestComputeContributions -v`
Expected: All 5 new tests PASS

- [ ] **Step 5: Run all tests to verify no regressions**

Run: `cd SHAP-model-api && python -m pytest tests/ -v`
Expected: All 27 tests pass (12 existing inference + 5 new contributions + 10 API)

- [ ] **Step 6: Commit**

```bash
git add SHAP-model-api/src/engine/inference_engine.py SHAP-model-api/tests/test_inference.py
git commit -m "feat(ml): add compute_contributions method with weighted factor breakdown"
```

---

### Task 3: ML Service — Enhance `/predict` response with explanation

**Files:**
- Modify: `SHAP-model-api/src/main.py:59-79`
- Test: `SHAP-model-api/tests/test_api.py` (append new tests)

- [ ] **Step 1: Write the failing test for enhanced predict response**

Append to `SHAP-model-api/tests/test_api.py`:

```python
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
    assert body["explanation"]["summary_id"] == "Tidak ada faktor risiko terdeteksi."


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd SHAP-model-api && python -m pytest tests/test_api.py::test_predict_response_has_explanation -v`
Expected: FAIL — `AssertionError: assert 'explanation' in body`

- [ ] **Step 3: Modify `/predict` endpoint to include explanation**

In `SHAP-model-api/src/main.py`, update the `predict_risk` function. Replace lines 75-77:

```python
    try:
        result = engine.predict(data_for_engine)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

With:

```python
    try:
        result = engine.predict(data_for_engine)
        explanation = engine.compute_contributions(result, community_rules["rules"])
        result["explanation"] = explanation
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 4: Run new tests to verify they pass**

Run: `cd SHAP-model-api && python -m pytest tests/test_api.py -v`
Expected: All 14 API tests pass (10 existing + 4 new)

- [ ] **Step 5: Run all ML service tests**

Run: `cd SHAP-model-api && python -m pytest tests/ -v`
Expected: All 31 tests pass

- [ ] **Step 6: Commit**

```bash
git add SHAP-model-api/src/main.py SHAP-model-api/tests/test_api.py
git commit -m "feat(ml): enhance /predict response with explanation field"
```

---

### Task 4: Backend — Update `MlResult` type to include explanation

**Files:**
- Modify: `disaster-backend/src/types.ts:22-27`

- [ ] **Step 1: Add explanation types to `types.ts`**

In `disaster-backend/src/types.ts`, replace the `MlResult` type (lines 22-27) with:

```typescript
export type ContributionItem = {
	factor: string;
	label_id: string;
	label_en: string;
	category: "natural_sign" | "community";
	weight: number;
	direction: "increases_risk" | "neutral";
	detail_id: string;
	detail_en: string;
};

export type CommunityProfileFactor = {
	key: string;
	label_id: string;
	label_en: string;
	value: number;
	status: string;
	detail_id: string;
	detail_en: string;
};

export type ExplanationData = {
	summary_id: string;
	summary_en: string;
	contributions: ContributionItem[];
	community_profile: {
		beach: string;
		overall: string;
		factors: CommunityProfileFactor[];
	};
};

export type MlResult = {
	active_warning: string[];
	sign_description: string;
	community_characteristics: string;
	action_recommendation: string;
	triggered_lik_codes?: string[];
	explanation?: ExplanationData;
};
```

- [ ] **Step 2: Run backend typecheck**

Run: `cd disaster-backend && bun run tsc --noEmit 2>&1 || true`
Expected: No new type errors introduced

- [ ] **Step 3: Commit**

```bash
git add disaster-backend/src/types.ts
git commit -m "feat(backend): add ExplanationData type to types.ts"
```

---

### Task 5: Backend — Add `GET /api/alerts/:id/explanation` endpoint

**Files:**
- Modify: `disaster-backend/src/routes/alerts.ts`
- Test: `disaster-backend/src/routes/alerts.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `disaster-backend/src/routes/alerts.test.ts`:

```typescript
describe("GET /alerts/:id/explanation", () => {
	beforeEach(() => {
		mockXRrange.mockClear();
	});

	test("returns explanation for alert with ML explanation data", async () => {
		const payload = {
			eventType: "DISASTER_ALERT",
			alertId: "test-alert-explain-1",
			serverTimestamp: 1000000,
			reportId: "report-001",
			beachLocation: "pantai_samas",
			riskLevel: "unsafe-high",
			decision: { community_characteristics: "Low Actionable", shouldDistribute: true, is_multisign: true },
			input: { beach_location: "pantai_samas", lik_codes: ["wn-4"] },
			ml: {
				sign_description: "Ombak besar",
				community_characteristics: "Low Actionable",
				action_recommendation: "Siaga penuh",
				triggered_lik_codes: ["Wn-4"],
				explanation: {
					summary_id: "Bahaya karena ombak besar (40%), frekuensi pelaporan (30%)",
					summary_en: "Danger due to high waves (40%), reporting frequency (30%)",
					contributions: [
						{ factor: "Wn-4", label_id: "Ombak Besar", label_en: "High Waves", category: "natural_sign", weight: 0.4, direction: "increases_risk", detail_id: "Gelombang tinggi", detail_en: "High waves detected" },
						{ factor: "frequency", label_id: "Frekuensi Pelaporan", label_en: "Reporting Frequency", category: "community", weight: 0.3, direction: "increases_risk", detail_id: "Jarang melapor", detail_en: "Rarely reports" },
					],
					community_profile: {
						beach: "pantai_samas",
						overall: "Unsafe",
						factors: [
							{ key: "interaction", label_id: "Interaksi Bencana", label_en: "Disaster Interaction", value: 2.13, status: "Safe", detail_id: "Cukup", detail_en: "Adequate" },
							{ key: "frequency", label_id: "Frekuensi", label_en: "Frequency", value: 2.59, status: "Unsafe", detail_id: "Jarang", detail_en: "Rarely" },
						],
					},
				},
			},
		};

		mockXRrange.mockResolvedValue([
			{ id: "1000000-0", message: { json: JSON.stringify(payload) } },
		]);

		const res = await app.request("/api/alerts/test-alert-explain-1/explanation");
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.data.alertId).toBe("test-alert-explain-1");
		expect(body.data.riskLevel).toBe("unsafe-high");
		expect(body.data.beachLocation).toBe("pantai_samas");
		expect(body.data.summary_id).toContain("Ombak Besar");
		expect(body.data.contributions).toHaveLength(2);
		expect(body.data.communityProfile.overall).toBe("Unsafe");
	});

	test("returns 404 when alert not found", async () => {
		mockXRrange.mockResolvedValue([]);

		const res = await app.request("/api/alerts/nonexistent-id/explanation");
		expect(res.status).toBe(404);
	});

	test("returns explanation without reassurance when not available", async () => {
		const payload = {
			eventType: "DISASTER_ALERT",
			alertId: "test-alert-no-reassurance",
			serverTimestamp: 1000000,
			reportId: "report-002",
			decision: { community_characteristics: "Actionable", shouldDistribute: true },
			input: { beach_location: "pantai_lampuuk", lik_codes: ["wn-2"] },
			ml: {
				sign_description: "Awan bergumpal",
				community_characteristics: "Actionable",
				action_recommendation: "Berhati-hati",
				explanation: {
					summary_id: "Bahaya karena awan bergumpal (30%)",
					summary_en: "Danger due to clustered clouds (30%)",
					contributions: [
						{ factor: "Wn-2", label_id: "Awan Bergumpal", label_en: "Clustered Clouds", category: "natural_sign", weight: 0.3, direction: "increases_risk", detail_id: "Awan bergumpal", detail_en: "Clustered clouds" },
					],
					community_profile: { beach: "pantai_lampuuk", overall: "Safe", factors: [] },
				},
			},
		};

		mockXRrange.mockResolvedValue([
			{ id: "1000000-0", message: { json: JSON.stringify(payload) } },
		]);

		const res = await app.request("/api/alerts/test-alert-no-reassurance/explanation");
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.data.reassurance).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd disaster-backend && bun test src/routes/alerts.test.ts`
Expected: FAIL — 404 for all new tests (route doesn't exist yet)

- [ ] **Step 3: Implement the explanation endpoint**

In `disaster-backend/src/routes/alerts.ts`, add the new route before `export default route;`:

```typescript
route.get("/alerts/:id/explanation", async (c) => {
	const alertId = c.req.param("id");
	const events = await redis.xRange(ALERTS_STREAM, "-", "+", { COUNT: 1000 });

	if (!events || events.length === 0) {
		return c.json({ ok: false, error: "Alert not found" }, 404);
	}

	const target = (events as unknown as { id: string; message: Record<string, string> }[]).find((event) => {
		const parsed = JSON.parse(event.message.json ?? "{}") as Record<string, unknown>;
		return parsed.alertId === alertId;
	});

	if (!target) {
		return c.json({ ok: false, error: "Alert not found" }, 404);
	}

	const parsed = JSON.parse(target.message.json ?? "{}") as Record<string, unknown>;
	const ml = parsed.ml as Record<string, unknown> | undefined;
	const decision = parsed.decision as Record<string, unknown> | undefined;
	const input = parsed.input as Record<string, unknown> | undefined;
	const reassurance = parsed.reassurance as Record<string, unknown> | undefined;
	const explanation = ml?.explanation as Record<string, unknown> | undefined;

	return c.json({
		ok: true,
		data: {
			alertId: (parsed.alertId as string) ?? "",
			riskLevel: (parsed.riskLevel as string) ?? deriveRiskLevel(decision),
			beachLocation: (input?.beach_location as string) ?? "",
			summary_id: (explanation?.summary_id as string) ?? "",
			summary_en: (explanation?.summary_en as string) ?? "",
			contributions: (explanation?.contributions as unknown[]) ?? [],
			communityProfile: (explanation?.community_profile as unknown) ?? null,
			reassurance: reassurance ?? null,
			createdAt: (parsed.serverTimestamp as number)
				? new Date(parsed.serverTimestamp as number).toISOString()
				: null,
		},
	});
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd disaster-backend && bun test src/routes/alerts.test.ts`
Expected: All 6 tests pass (3 existing + 3 new)

- [ ] **Step 5: Run all backend tests**

Run: `cd disaster-backend && bun test`
Expected: All tests pass

- [ ] **Step 6: Add `/api/alerts/:id/explanation` to JWT public paths**

In `disaster-backend/src/config.ts`, add `"/api/alerts"` to the `JWT_PUBLIC_PATHS` list. Since `"/api/alerts"` is already there (it covers the list endpoint and the `:id/explanation` sub-path), no change is needed if Hono matches the base path. However, to be explicit, verify the existing entry covers it. If not, add a specific entry.

Actually, looking at the existing `JWT_PUBLIC_PATHS` (line 67), `"/api/alerts"` is already listed. Since the Hono route is registered as `alertsRoute` which includes both `/alerts` and `/alerts/:id/explanation`, and JWT middleware checks path prefixes, this should already be covered. No change needed.

- [ ] **Step 7: Commit**

```bash
git add disaster-backend/src/routes/alerts.ts disaster-backend/src/routes/alerts.test.ts
git commit -m "feat(backend): add GET /api/alerts/:id/explanation endpoint"
```

---

### Task 6: Backend — Update `alerts.ts` list endpoint to pass through explanation data

**Files:**
- Modify: `disaster-backend/src/routes/alerts.ts:32-45`

- [ ] **Step 1: Add explanation summary to list response**

In `disaster-backend/src/routes/alerts.ts`, modify the alert mapping in the `GET /alerts` handler. Add `explanation` to the mapped object returned in the loop (around line 32-45):

After line 43 (`triggeredCodes`), add:

```typescript
			explanation: ml?.explanation as Record<string, unknown> | undefined,
```

This passes the full explanation data through so the frontend can access it from the list response without needing a separate fetch.

- [ ] **Step 2: Run tests**

Run: `cd disaster-backend && bun test src/routes/alerts.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add disaster-backend/src/routes/alerts.ts
git commit -m "feat(backend): pass explanation data through alerts list response"
```

---

### Task 7: Frontend — Add `recharts` dependency

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install recharts**

Run: `cd frontend && bun add recharts`

Expected: `recharts` added to `dependencies` in `package.json`

- [ ] **Step 2: Verify installation**

Run: `cd frontend && bun run tsc --noEmit 2>&1 | head -5 || true`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/bun.lockb
git commit -m "chore(frontend): add recharts dependency"
```

---

### Task 8: Frontend — Add explanation types

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Add explanation types**

Append to `frontend/src/lib/types.ts`:

```typescript
export type ContributionItem = {
	factor: string;
	label_id: string;
	label_en: string;
	category: "natural_sign" | "community";
	weight: number;
	direction: "increases_risk" | "neutral";
	detail_id: string;
	detail_en: string;
};

export type CommunityProfileFactor = {
	key: string;
	label_id: string;
	label_en: string;
	value: number;
	status: string;
	detail_id: string;
	detail_en: string;
};

export type ExplanationData = {
	summary_id: string;
	summary_en: string;
	contributions: ContributionItem[];
	community_profile: {
		beach: string;
		overall: string;
		factors: CommunityProfileFactor[];
	};
};

export type AlertExplanationResponse = {
	alertId: string;
	riskLevel: string;
	beachLocation: string;
	summary_id: string;
	summary_en: string;
	contributions: ContributionItem[];
	communityProfile: ExplanationData["community_profile"] | null;
	reassurance: {
		shapRisk: string;
		bmkgRisk: string;
		agreed: boolean;
		finalLevel: string;
		bmkgDetails: {
			waveHeight: number;
			windSpeed: number;
			hasWarning: boolean;
		} | null;
	} | null;
	createdAt: string | null;
};
```

- [ ] **Step 2: Update `AlertFeedItem` to include optional explanation**

In `frontend/src/lib/types.ts`, add to the `AlertFeedItem` type (after line 14):

```typescript
	explanation?: ExplanationData;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(frontend): add explanation types to types.ts"
```

---

### Task 9: Frontend — Add `fetchAlertExplanation` API function

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the fetch function**

Append to `frontend/src/lib/api.ts`:

```typescript
export async function fetchAlertExplanation(alertId: string): Promise<AlertExplanationResponse | null> {
	const res = await fetch(`${API_BASE}/alerts/${alertId}/explanation`);
	const json = await res.json();
	if (!json.ok) return null;
	return json.data as AlertExplanationResponse;
}
```

Also update the import on line 1 to include the new type:

```typescript
import type { AlertFeedItem, BmkgData, ReportResult, AlertExplanationResponse } from "./types";
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): add fetchAlertExplanation API function"
```

---

### Task 10: Frontend — Update `alert-utils.ts` to transform explanation data

**Files:**
- Modify: `frontend/src/lib/alert-utils.ts`

- [ ] **Step 1: Update `RawAlertEvent` type and `transformAlert`**

In `frontend/src/lib/alert-utils.ts`, update the `RawAlertEvent` type to include explanation in the `ml` field (add after line 25):

```typescript
		explanation?: {
			summary_id?: string;
			summary_en?: string;
			contributions?: Array<{
				factor: string;
				label_id: string;
				label_en: string;
				category: string;
				weight: number;
				direction: string;
				detail_id: string;
				detail_en: string;
			}>;
			community_profile?: {
				beach: string;
				overall: string;
				factors: Array<{
					key: string;
					label_id: string;
					label_en: string;
					value: number;
					status: string;
					detail_id: string;
					detail_en: string;
				}>;
			};
		};
```

Update the import to include `ExplanationData`:

```typescript
import type { AlertFeedItem, ExplanationData } from "./types";
```

Update the `transformAlert` function return (add after line 54):

```typescript
		explanation: raw.ml?.explanation as ExplanationData | undefined,
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/alert-utils.ts
git commit -m "feat(frontend): transform explanation data in alert-utils"
```

---

### Task 11: Frontend — Create `ContributionBarChart` component

**Files:**
- Create: `frontend/src/components/contribution-bar-chart.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/contribution-bar-chart.tsx`:

```tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { ContributionItem } from "@/lib/types";

type ContributionBarChartProps = {
	contributions: ContributionItem[];
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ContributionItem }> }) {
	if (!active || !payload?.length) return null;
	const item = payload[0].payload;
	return (
		<div className="rounded-lg border bg-white px-3 py-2 shadow-sm text-xs">
			<p className="font-semibold">{item.label_id}</p>
			<p className="text-muted-foreground">{item.detail_id}</p>
			<p className="font-medium mt-1">{Math.round(item.weight * 100)}%</p>
		</div>
	);
}

const SIGN_COLORS = ["#DC2626", "#EA580C", "#F59E0B"];
const COMMUNITY_COLORS = ["#7C3AED", "#8B5CF6", "#A78BFA", "#C4B5FD", "#DDD6FE"];

export function ContributionBarChart({ contributions }: ContributionBarChartProps) {
	const visible = contributions.filter((c) => c.weight > 0);

	if (visible.length === 0) return null;

	const data = visible.map((c) => ({
		...c,
		displayName: c.label_id,
		percentage: Math.round(c.weight * 100),
	}));

	return (
		<div>
			<h4 className="text-xs font-semibold text-[#0A2540] mb-2">Kontribusi Faktor Risiko</h4>
			<ResponsiveContainer width="100%" height={Math.max(data.length * 36, 120)}>
				<BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
					<XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} hide />
					<YAxis type="category" dataKey="displayName" width={130} tick={{ fontSize: 11 }} />
					<Tooltip content={<CustomTooltip />} />
					<Bar dataKey="percentage" radius={[0, 4, 4, 0]} barSize={24}>
						{data.map((entry, index) => {
							const isNatural = entry.category === "natural_sign";
							const palette = isNatural ? SIGN_COLORS : COMMUNITY_COLORS;
							const colorIndex = isNatural
								? data.filter((d) => d.category === "natural_sign").indexOf(entry)
								: data.filter((d) => d.category === "community").indexOf(entry);
							return <Cell key={entry.factor} fill={palette[colorIndex % palette.length]} />;
						})}
					</Bar>
				</BarChart>
			</ResponsiveContainer>
			<div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
				<span className="flex items-center gap-1">
					<span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#DC2626]" />
					Tanda Alam
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#7C3AED]" />
					Faktor Komunitas
				</span>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verify no type errors**

Run: `cd frontend && bun run tsc --noEmit 2>&1 | head -20 || true`
Expected: No errors in the new file

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/contribution-bar-chart.tsx
git commit -m "feat(frontend): create ContributionBarChart component"
```

---

### Task 12: Frontend — Create `CommunityProfileTable` component

**Files:**
- Create: `frontend/src/components/community-profile-table.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/community-profile-table.tsx`:

```tsx
"use client";

import type { CommunityProfileFactor } from "@/lib/types";

type CommunityProfileTableProps = {
	beach: string;
	overall: string;
	factors: CommunityProfileFactor[];
};

function StatusBadge({ status }: { status: string }) {
	const isUnsafe = status === "Unsafe";
	return (
		<span
			className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
				isUnsafe
					? "bg-red-50 text-red-700 border border-red-200"
					: "bg-green-50 text-green-700 border border-green-200"
			}`}
		>
			{isUnsafe ? "Rentan" : "Aman"}
		</span>
	);
}

export function CommunityProfileTable({ beach, overall, factors }: CommunityProfileTableProps) {
	return (
		<div>
			<div className="flex items-center justify-between mb-2">
				<h4 className="text-xs font-semibold text-[#0A2540]">Profil Komunitas</h4>
				<span
					className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
						overall === "Unsafe"
							? "bg-red-50 text-red-700 border border-red-200"
							: "bg-green-50 text-green-700 border border-green-200"
					}`}
				>
					{overall === "Unsafe" ? "Rentan" : "Aman"}
				</span>
			</div>
			<div className="rounded-lg border overflow-hidden">
				<table className="w-full text-xs">
					<thead>
						<tr className="bg-muted/50">
							<th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Faktor</th>
							<th className="text-center px-3 py-1.5 font-medium text-muted-foreground">Nilai</th>
							<th className="text-center px-3 py-1.5 font-medium text-muted-foreground">Status</th>
						</tr>
					</thead>
					<tbody>
						{factors.map((f) => (
							<tr key={f.key} className="border-t">
								<td className="px-3 py-1.5">
									<span className="font-medium">{f.label_id}</span>
									<p className="text-[10px] text-muted-foreground">{f.detail_id}</p>
								</td>
								<td className="text-center px-3 py-1.5 font-mono">{f.value.toFixed(2)}</td>
								<td className="text-center px-3 py-1.5">
									<StatusBadge status={f.status} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/community-profile-table.tsx
git commit -m "feat(frontend): create CommunityProfileTable component"
```

---

### Task 13: Frontend — Create `CrossValidationBadge` component

**Files:**
- Create: `frontend/src/components/cross-validation-badge.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/cross-validation-badge.tsx`:

```tsx
"use client";

import { CheckCircle, AlertTriangle } from "lucide-react";

type CrossValidationBadgeProps = {
	shapRisk: string;
	bmkgRisk: string;
	agreed: boolean;
	finalLevel: string;
	bmkgDetails?: {
		waveHeight: number;
		windSpeed: number;
		hasWarning: boolean;
	} | null;
};

export function CrossValidationBadge({ shapRisk, bmkgRisk, agreed, finalLevel, bmkgDetails }: CrossValidationBadgeProps) {
	return (
		<div>
			<h4 className="text-xs font-semibold text-[#0A2540] mb-2">Validasi Silang (SHAP vs BMKG)</h4>
			<div className={`rounded-lg border p-3 ${agreed ? "border-green-200 bg-green-50/50" : "border-yellow-200 bg-yellow-50/50"}`}>
				<div className="flex items-center gap-2 mb-2">
					{agreed ? (
						<CheckCircle size={16} className="text-green-600 flex-shrink-0" />
					) : (
						<AlertTriangle size={16} className="text-yellow-600 flex-shrink-0" />
					)}
					<span className="text-xs font-medium">
						{agreed ? "Konsisten" : "Tidak Konsisten"}
					</span>
				</div>
				<div className="grid grid-cols-3 gap-2 text-center">
					<div>
						<p className="text-[10px] text-muted-foreground">SHAP</p>
						<p className={`text-xs font-bold ${shapRisk === "HIGH" ? "text-red-600" : "text-green-600"}`}>
							{shapRisk}
						</p>
					</div>
					<div>
						<p className="text-[10px] text-muted-foreground">BMKG</p>
						<p className={`text-xs font-bold ${bmkgRisk === "HIGH" ? "text-red-600" : "text-green-600"}`}>
							{bmkgRisk}
						</p>
					</div>
					<div>
						<p className="text-[10px] text-muted-foreground">Akhir</p>
						<p className="text-xs font-bold text-[#0A2540]">{finalLevel}</p>
					</div>
				</div>
				{bmkgDetails && (
					<div className="mt-2 pt-2 border-t border-yellow-200/50 flex gap-3 text-[10px] text-muted-foreground">
						<span>Gelombang: {bmkgDetails.waveHeight}m</span>
						<span>Angin: {bmkgDetails.windSpeed}km/j</span>
						{bmkgDetails.hasWarning && <span className="text-yellow-700 font-medium">Peringatan Aktif</span>}
					</div>
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/cross-validation-badge.tsx
git commit -m "feat(frontend): create CrossValidationBadge component"
```

---

### Task 14: Frontend — Create `explanation-panel.tsx` container component

**Files:**
- Create: `frontend/src/components/explanation-panel.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/explanation-panel.tsx`:

```tsx
"use client";

import type { ExplanationData } from "@/lib/types";
import { ContributionBarChart } from "./contribution-bar-chart";
import { CommunityProfileTable } from "./community-profile-table";
import { CrossValidationBadge } from "./cross-validation-badge";

type ExplanationPanelProps = {
	explanation: ExplanationData;
	reassurance?: {
		shapRisk: string;
		bmkgRisk: string;
		agreed: boolean;
		finalLevel: string;
		bmkgDetails?: {
			waveHeight: number;
			windSpeed: number;
			hasWarning: boolean;
		} | null;
	} | null;
};

export function ExplanationPanel({ explanation, reassurance }: ExplanationPanelProps) {
	return (
		<div className="space-y-4 pt-2">
			{explanation.summary_id && (
				<p className="text-xs text-muted-foreground leading-relaxed">{explanation.summary_id}</p>
			)}

			<ContributionBarChart contributions={explanation.contributions} />

			{explanation.community_profile && (
				<CommunityProfileTable
					beach={explanation.community_profile.beach}
					overall={explanation.community_profile.overall}
					factors={explanation.community_profile.factors}
				/>
			)}

			{reassurance && (
				<CrossValidationBadge
					shapRisk={reassurance.shapRisk}
					bmkgRisk={reassurance.bmkgRisk}
					agreed={reassurance.agreed}
					finalLevel={reassurance.finalLevel}
					bmkgDetails={reassurance.bmkgDetails}
				/>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/explanation-panel.tsx
git commit -m "feat(frontend): create ExplanationPanel container component"
```

---

### Task 15: Frontend — Modify `alert-card.tsx` to include expandable explanation

**Files:**
- Modify: `frontend/src/components/alert-card.tsx`

- [ ] **Step 1: Add expandable "Kenapa?" section to AlertCard**

In `frontend/src/components/alert-card.tsx`, add the expandable explanation section. Replace the full file content with:

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Calendar, Users, Clock, CheckCircle, ChevronDown, ChevronUp, Info } from "lucide-react";
import { BEACHES, LIK_SIGNS } from "@/lib/constants";
import type { AlertFeedItem, ExplanationData } from "@/lib/types";
import { deriveAlertTitle, deriveStartDate, deriveEndDate } from "@/lib/alert-utils";
import { ExplanationPanel } from "./explanation-panel";
import { fetchAlertExplanation } from "@/lib/api";

function relativeTime(ts: number): string {
	const diff = Date.now() - ts;
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "Baru saja";
	if (mins < 60) return `${mins} menit lalu`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours} jam lalu`;
	return `${Math.floor(hours / 24)} hari lalu`;
}

function beachName(slug: string): string {
	const b = BEACHES.find((x) => x.id === slug);
	return b?.name ?? slug.replace(/_/g, " ");
}

function formatDateTime(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString("id-ID", {
		day: "numeric",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatTime(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function codeToLabel(code: string): string {
	const sign = LIK_SIGNS.find((s) => s.code === code);
	return sign?.label ?? code;
}

function isUnsafe(risk: string): boolean {
	const lower = risk.toLowerCase();
	return lower.includes("unsafe") || lower.includes("tidak aman") || lower.includes("high");
}

export function AlertCard({ alert }: { alert: AlertFeedItem }) {
	const unsafe = isUnsafe(alert.riskLevel);
	const Icon = unsafe ? AlertTriangle : CheckCircle;
	const [expanded, setExpanded] = useState(false);
	const [explanationData, setExplanationData] = useState<ExplanationData | null>(null);
	const [reassuranceData, setReassuranceData] = useState<{ shapRisk: string; bmkgRisk: string; agreed: boolean; finalLevel: string; bmkgDetails: { waveHeight: number; windSpeed: number; hasWarning: boolean } | null } | null>(null);
	const [loading, setLoading] = useState(false);

	const hasExplanation = !!alert.explanation;

	async function handleShowExplanation() {
		if (expanded) {
			setExpanded(false);
			return;
		}

		if (alert.explanation) {
			setExplanationData(alert.explanation);
			setExpanded(true);
			return;
		}

		setLoading(true);
		try {
			const result = await fetchAlertExplanation(alert.alertId);
			if (result) {
				setExplanationData({
					summary_id: result.summary_id,
					summary_en: result.summary_en,
					contributions: result.contributions,
					community_profile: result.communityProfile ?? { beach: "", overall: "", factors: [] },
				});
				if (result.reassurance) {
					setReassuranceData(result.reassurance);
				}
			}
			setExpanded(true);
		} catch {
		} finally {
			setLoading(false);
		}
	}

	return (
		<Card
			className={`rounded-xl shadow-sm border-l-4 ${
				unsafe ? "border-l-[#DC2626]" : "border-l-[#16A34A]"
			}`}
		>
			<CardContent className="p-4 space-y-3">
				<div className="flex items-start gap-2">
					<Icon
						size={20}
						className={unsafe ? "text-[#DC2626] mt-0.5 flex-shrink-0" : "text-[#16A34A] mt-0.5 flex-shrink-0"}
					/>
					<div className="flex-1 min-w-0">
						<h3 className="text-sm font-semibold leading-tight">{deriveAlertTitle(alert)}</h3>
					</div>
					<span className="text-xs text-muted-foreground flex-shrink-0">
						{relativeTime(alert.serverTimestamp)}
					</span>
				</div>

				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<Calendar size={12} />
					<span>{new Date(alert.serverTimestamp).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
				</div>

				<div className="flex items-center gap-3 text-xs text-muted-foreground">
					<span className="flex items-center gap-1">
						<Users size={12} />
						{alert.reporterCount} nelayan
					</span>
					<span className="flex items-center gap-1">
						<Clock size={12} />
						Pantauan: {formatTime(deriveStartDate(alert))} – {formatTime(deriveEndDate(alert))}
					</span>
				</div>

				<div>
					<p className="text-xs font-medium text-muted-foreground mb-1">Tanda Alam Terdeteksi:</p>
					<ul className="space-y-0.5">
						{alert.triggeredCodes.map((code) => (
							<li key={code} className="text-xs text-foreground flex items-start gap-1.5">
								<span className="text-muted-foreground mt-0.5">-</span>
								<span>{codeToLabel(code)}</span>
							</li>
						))}
					</ul>
					{alert.signDescription && (
						<p className="text-xs text-muted-foreground mt-1 italic">{alert.signDescription}</p>
					)}
				</div>

				<div>
					<p className="text-xs font-medium text-muted-foreground mb-1">Rekomendasi Aksi:</p>
					<p className="text-xs text-foreground leading-relaxed">{alert.actionRecommendation}</p>
				</div>

				<button
					type="button"
					onClick={handleShowExplanation}
					disabled={loading}
					className="flex items-center gap-1.5 text-xs text-[#0EA5E9] font-medium hover:underline disabled:opacity-50 w-full"
				>
					<Info size={14} />
					{loading ? "Memuat..." : expanded ? "Sembunyikan Penjelasan" : "Kenapa bahaya?"}
					{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
				</button>

				{expanded && explanationData && (
					<ExplanationPanel explanation={explanationData} reassurance={reassuranceData} />
				)}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 2: Verify no type errors**

Run: `cd frontend && bun run tsc --noEmit 2>&1 | head -20 || true`
Expected: No errors (or fix any type issues)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/alert-card.tsx
git commit -m "feat(frontend): add expandable explanation section to AlertCard"
```

---

### Task 16: End-to-end verification

**Files:**
- No new files

- [ ] **Step 1: Run all ML service tests**

Run: `cd SHAP-model-api && python -m pytest tests/ -v`
Expected: All 31 tests pass

- [ ] **Step 2: Run all backend tests**

Run: `cd disaster-backend && bun test`
Expected: All tests pass

- [ ] **Step 3: Run frontend typecheck**

Run: `cd frontend && bun run tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run frontend build**

Run: `cd frontend && bun run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve type/build issues from explainability integration"
```
