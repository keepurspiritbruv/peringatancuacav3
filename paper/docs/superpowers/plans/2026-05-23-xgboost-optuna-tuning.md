# XGBoost Optuna Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `gen_notebook.py` to produce a notebook that uses Optuna HPO, TimeSeriesSplit validation, production-aligned features, early stopping, recall-oriented metrics, and 2 ablation studies.

**Architecture:** Single Python generator script (`gen_notebook.py`) that outputs a Jupyter notebook JSON. The notebook runs on Google Colab, downloads Kaggle data, filters to Aceh+Yogyakarta, trains XGBoost with Optuna, evaluates, runs ablations, and exports `.pkl` artifacts compatible with existing `xgboost_service.py`.

**Tech Stack:** Python, XGBoost, Optuna, scikit-learn, imbalanced-learn (SMOTE), SHAP, joblib, pandas, numpy, matplotlib, seaborn, kagglehub

---

## File Structure

| File | Responsibility |
|------|---------------|
| `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py` | Generator script — creates notebook JSON |
| `SHAP-model-api\xgboost\xgboost_weather.ipynb` | Output notebook (generated, committed to repo) |

No other files are created or modified. The existing `xgboost_service.py` stays unchanged — the notebook produces compatible `.pkl` artifacts.

---

### Task 1: Rewrite generator — helper functions and notebook header

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py:1-57`

- [ ] **Step 1: Rewrite imports and helper functions**

Keep existing `md()` and `code()` helpers. Update the `cells` list start.

```python
import json
import os
import uuid

cells = []

def _cell_id():
    return uuid.uuid4().hex[:8]

def md(source):
    lines = source.split("\n")
    source_list = [l + "\n" for l in lines[:-1]] + ([lines[-1]] if lines else [])
    return {"cell_type": "markdown", "metadata": {"id": _cell_id()}, "source": source_list}

def code(source):
    lines = source.split("\n")
    source_list = [l + "\n" for l in lines[:-1]] + ([lines[-1]] if lines else [])
    return {
        "cell_type": "code",
        "metadata": {"id": _cell_id(), "colab": {"base_uri": "a://", "height": 17}},
        "source": source_list,
        "execution_count": None,
        "outputs": []
    }
```

- [ ] **Step 2: Rewrite Section 1 (Setup) cells**

Add `optuna` to pip install. Add `TimeSeriesSplit`, `fbeta_score`, and `average_precision_score` to imports.

```python
cells.append(code("""# @title Install dependencies
!pip install xgboost scikit-learn imbalanced-learn shap matplotlib seaborn pandas numpy joblib kagglehub optuna -q"""))

cells.append(code("""# @title Import libraries
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import json
import os
import glob
import joblib
import warnings
from datetime import datetime, timezone, timedelta

from sklearn.model_selection import TimeSeriesSplit, GridSearchCV
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    fbeta_score, classification_report, confusion_matrix,
    average_precision_score, roc_auc_score
)
from imblearn.over_sampling import SMOTE
from xgboost import XGBClassifier
import optuna
import shap

warnings.filterwarnings('ignore')
plt.style.use('seaborn-v0_8-whitegrid')
pd.set_option('display.max_columns', 30)
print('All imports OK')"""))
```

- [ ] **Step 3: Verify generator runs**

Run: `python "C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py"`
Expected: Output stops (no output yet since notebook builder incomplete, but no syntax errors)

---

### Task 2: Rewrite generator — Data Collection (Section 2-3)

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py`

- [ ] **Step 1: Keep Section 2 cells unchanged**

Section 2 (Data Collection: Kaggle download, province filter, column rename) is already correct from the previous rewrite. Copy it as-is. The only change: set `RISK_LABELS` here instead of in the rename cell.

- [ ] **Step 2: Keep Section 3 cells unchanged**

Section 3 (Load & Inspect: info, descriptive stats, missing values, distribution plots) is already correct. Copy as-is.

---

### Task 3: Rewrite generator — Preprocessing (Section 4)

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py`

- [ ] **Step 1: Rewrite preprocessing cell with production-aligned features**

Key changes from current notebook:
- Group by `station_id` (not `beach`)
- Add `hour_sin` and `hour_cos` (default hour=12 for daily data)
- Keep `tutupan_awan` with median fill (not NaN)

```python
cells.append(code("""# @title Preprocessing
df["local_datetime"] = pd.to_datetime(df["local_datetime"], errors="coerce")
df = df.dropna(subset=["local_datetime"]).reset_index(drop=True)

for col in ["suhu", "kelembapan", "kecepatan_angin_knot", "curah_hujan", "arah_angin_deg"]:
    df[col] = pd.to_numeric(df[col], errors="coerce")

df["arah_angin_deg"] = df["arah_angin_deg"].fillna(0)
df["arah_angin_sin"] = np.sin(np.radians(df["arah_angin_deg"]))
df["arah_angin_cos"] = np.cos(np.radians(df["arah_angin_deg"]))

for col in ["suhu", "kelembapan", "kecepatan_angin_knot", "curah_hujan"]:
    if df[col].isnull().any():
        df[col] = df.groupby("station_id")[col].transform(lambda x: x.ffill().bfill())

df["curah_hujan"] = df["curah_hujan"].fillna(0)

df["tutupan_awan"] = np.nan
if "tutupan_awan" in df.columns:
    df["tutupan_awan"] = df["tutupan_awan"].fillna(df["tutupan_awan"].median())
else:
    df["tutupan_awan"] = 50.0

df["hour_sin"] = np.sin(2 * np.pi * 12 / 24)
df["hour_cos"] = np.cos(2 * np.pi * 12 / 24)

print(f"Preprocessed: {df.shape}")
print(f"Remaining NaN: {df.isnull().sum().sum()}")
df.head()"""))
```

---

### Task 4: Rewrite generator — Feature Engineering (Section 5)

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py`

- [ ] **Step 1: Rewrite feature engineering with production naming**

Use production feature names: `tp_roll_mean_6h`, `tp_roll_max_6h`, `hu_delta_3h`, `ws_delta_3h`, `t_delta_3h`, `tp_cumsum_24h`. Group by `station_id`. Define `FEATURE_COLUMNS` (15 features) and `RAW_FEATURES` (7 features for ablation 2).

```python
cells.append(code("""# @title Feature engineering
df = df.sort_values(["station_id", "local_datetime"]).reset_index(drop=True)

def engineer_features(group):
    group = group.sort_values("local_datetime").reset_index(drop=True)
    group["tp_roll_mean_6h"] = group["curah_hujan"].rolling(window=2, min_periods=1).mean()
    group["tp_roll_max_6h"] = group["curah_hujan"].rolling(window=2, min_periods=1).max()
    group["hu_delta_3h"] = group["kelembapan"].diff().fillna(0)
    group["ws_delta_3h"] = group["kecepatan_angin_knot"].diff().fillna(0)
    group["t_delta_3h"] = group["suhu"].diff().fillna(0)
    group["tp_cumsum_24h"] = group["curah_hujan"].rolling(window=8, min_periods=1).sum()
    return group

df = df.groupby("station_id", group_keys=False).apply(engineer_features).reset_index(drop=True)

FEATURE_COLUMNS = [
    "suhu", "kelembapan", "kecepatan_angin_knot", "curah_hujan",
    "tutupan_awan", "arah_angin_sin", "arah_angin_cos",
    "tp_roll_mean_6h", "tp_roll_max_6h",
    "hu_delta_3h", "ws_delta_3h", "t_delta_3h",
    "tp_cumsum_24h",
    "hour_sin", "hour_cos",
]

RAW_FEATURES = [
    "suhu", "kelembapan", "kecepatan_angin_knot", "curah_hujan",
    "tutupan_awan", "arah_angin_sin", "arah_angin_cos",
]

print(f"Full features ({len(FEATURE_COLUMNS)}): {FEATURE_COLUMNS}")
print(f"Raw features ({len(RAW_FEATURES)}): {RAW_FEATURES}")
print(f"Shape: {df.shape}")
df[FEATURE_COLUMNS].describe().round(2)"""))
```

---

### Task 5: Rewrite generator — Threshold Labeling (Section 6)

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py`

- [ ] **Step 1: Keep threshold labeling unchanged**

Copy existing threshold labeling cells as-is. The only change: use `tp_cumsum_24h` (production name) instead of `tp_cumsum_7d`. Remove `tutupan_awan` from the threshold function since Kaggle data doesn't have meaningful cloud cover.

---

### Task 6: Rewrite generator — Train-Test Split + SMOTE (Section 7)

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py`

- [ ] **Step 1: Replace temporal split with TimeSeriesSplit**

Replace the single 80/20 split + SMOTE cell with TimeSeriesSplit 3-fold + SMOTE per-fold.

```python
cells.append(code("""# @title TimeSeriesSplit 3-fold + SMOTE
from sklearn.model_selection import TimeSeriesSplit

X = df[FEATURE_COLUMNS].values
y = df["risk_level"].values

tscv = TimeSeriesSplit(n_splits=3)

print("TimeSeriesSplit folds:")
fold_info = []
for fold_idx, (train_idx, test_idx) in enumerate(tscv.split(X)):
    train_dates = df["local_datetime"].iloc[train_idx]
    test_dates = df["local_datetime"].iloc[test_idx]
    print(f"  Fold {fold_idx+1}: Train [{train_dates.min().date()} ~ {train_dates.max().date()}] ({len(train_idx)} rows)"
          f"  Test [{test_dates.min().date()} ~ {test_dates.max().date()}] ({len(test_idx)} rows)")
    fold_info.append((train_idx, test_idx))

print(f"\\nTrain label distribution (full):")
print(pd.Series(y).map(RISK_LABELS).value_counts())

smote = SMOTE(random_state=42, k_neighbors=min(3, min(pd.Series(y).value_counts()) - 1))
X_train_full = X[:fold_info[-1][0][-1]+1]
y_train_full = y[:fold_info[-1][0][-1]+1]
X_sm, y_sm = smote.fit_resample(X_train_full, y_train_full)
print(f"\\nAfter SMOTE (full train): {X_sm.shape[0]} rows")
print(pd.Series(y_sm).map(RISK_LABELS).value_counts())"""))
```

---

### Task 7: Rewrite generator — Optuna HPO (Section 8)

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py`

- [ ] **Step 1: Add Optuna HPO cell**

Define the objective function with TimeSeriesSplit + SMOTE per-fold + MedianPruner. Run 50 trials.

```python
cells.append(code("""# @title Optuna hyperparameter optimization (50 trials)
optuna.logging.set_verbosity(optuna.logging.WARNING)

def optuna_objective(trial):
    params = {
        "max_depth": trial.suggest_int("max_depth", 3, 7),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "n_estimators": trial.suggest_int("n_estimators", 100, 500),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
        "gamma": trial.suggest_float("gamma", 0.0, 5.0),
        "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 1.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 1.0, 10.0),
        "objective": "multi:softprob",
        "eval_metric": "mlogloss",
        "num_class": 4,
        "use_label_encoder": False,
        "random_state": 42,
        "tree_method": "hist",
    }

    cv_scores = []
    for fold_idx, (train_idx, test_idx) in enumerate(tscv.split(X)):
        X_tr, X_te = X[train_idx], X[test_idx]
        y_tr, y_te = y[train_idx], y[test_idx]

        min_class_count = min(pd.Series(y_tr).value_counts())
        k_neighbors = min(3, min_class_count - 1)
        if k_neighbors < 1:
            continue
        sm = SMOTE(random_state=42, k_neighbors=k_neighbors)
        X_sm, y_sm = sm.fit_resample(X_tr, y_tr)

        model = XGBClassifier(**params)
        model.fit(X_sm, y_sm, verbose=False)
        pred = model.predict(X_te)
        f1 = f1_score(y_te, pred, average="weighted", zero_division=0)
        cv_scores.append(f1)

    if not cv_scores:
        return 0.0
    return np.mean(cv_scores)

sampler = optuna.samplers.TPESampler(seed=42)
pruner = optuna.pruners.MedianPruner(n_startup_trials=10, n_warmup_steps=0)

study = optuna.create_study(direction="maximize", sampler=sampler, pruner=pruner)
study.optimize(optuna_objective, n_trials=50, show_progress_bar=True, n_jobs=-1)

print(f"\\nBest trial: #{study.best_trial.number}")
print(f"Best F1-weighted (CV): {study.best_value:.4f}")
print(f"Best params: {study.best_params}")"""))
```

- [ ] **Step 2: Add Optuna visualization cell**

```python
cells.append(code("""# @title Optuna optimization history & parameter importance
fig, axes = plt.subplots(1, 2, figsize=(16, 5))

trials_df = study.trials_dataframe()
axes[0].plot(trials_df["number"], trials_df["value"], "o-", markersize=3, alpha=0.7)
axes[0].axhline(y=study.best_value, color="r", linestyle="--", label=f"Best: {study.best_value:.4f}")
axes[0].set_xlabel("Trial")
axes[0].set_ylabel("F1-weighted (CV)")
axes[0].set_title("Optimization History")
axes[0].legend()

optuna.visualization.matplotlib.plot_param_importances(study, ax=axes[1])
axes[1].set_title("Parameter Importance")
plt.tight_layout()
plt.show()"""))
```

---

### Task 8: Rewrite generator — Final Training + Early Stopping (Section 8 continued)

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py`

- [ ] **Step 1: Replace GridSearch final model with Optuna best params + early stopping**

```python
cells.append(code("""# @title Train final model with best params + early stopping
from sklearn.model_selection import train_test_split as _split

X_train_main, X_val, y_train_main, y_val = _split(
    X_sm, y_sm, test_size=0.2, shuffle=False
)

best_model = XGBClassifier(
    **study.best_params,
    objective="multi:softprob",
    eval_metric="mlogloss",
    num_class=4,
    use_label_encoder=False,
    random_state=42,
    tree_method="hist",
)

best_model.fit(
    X_train_main, y_train_main,
    eval_set=[(X_val, y_val)],
    verbose=False,
    early_stopping_rounds=30,
)

best_iteration = best_model.best_iteration if hasattr(best_model, "best_iteration") else len(best_model.get_booster().get_dump())
print(f"Best iteration: {best_iteration}")
print(f"Model trained successfully")"""))
```

---

### Task 9: Rewrite generator — Evaluation (Section 9)

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py`

- [ ] **Step 1: Rewrite evaluation with recall-oriented metrics**

Use the LAST fold's test set (2021-2022 data) as the final test set. Add F2-score, recall per-class, PR-AUC.

```python
cells.append(code("""# @title Predict & metrics (last fold test set)
test_idx = fold_info[-1][1]
X_test = X[test_idx]
y_test = y[test_idx]

y_pred = best_model.predict(X_test)
y_prob = best_model.predict_proba(X_test)

acc = accuracy_score(y_test, y_pred)
prec = precision_score(y_test, y_pred, average="macro", zero_division=0)
rec = recall_score(y_test, y_pred, average="macro", zero_division=0)
f1 = f1_score(y_test, y_pred, average="weighted", zero_division=0)
f2 = fbeta_score(y_test, y_pred, beta=2, average="weighted", zero_division=0)

print(f"Accuracy:   {acc:.4f}")
print(f"Precision:  {prec:.4f} (macro)")
print(f"Recall:     {rec:.4f} (macro)")
print(f"F1-Score:   {f1:.4f} (weighted)")
print(f"F2-Score:   {f2:.4f} (weighted, recall-oriented)")

recall_per_class = recall_score(y_test, y_pred, labels=[0,1,2,3], average=None, zero_division=0)
print(f"\\nRecall per-class:")
for i, label in RISK_LABELS.items():
    print(f"  {label}: {recall_per_class[i]:.4f}")

print(f"\\nClassification Report:")
print(classification_report(y_test, y_pred, labels=[0,1,2,3], target_names=["Normal", "Waspada", "Siaga", "Ekstrem"], zero_division=0))"""))
```

- [ ] **Step 2: Keep confusion matrix cell unchanged**

Copy existing confusion matrix cell as-is (it already uses `labels=[0,1,2,3]`).

---

### Task 10: Rewrite generator — Visualization (Section 10)

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py`

- [ ] **Step 1: Keep feature importance and SHAP cells unchanged**

Copy existing cells. They already work with `FEATURE_COLUMNS` and `best_model`.

- [ ] **Step 2: Update time-series prediction cell**

Change `beach` grouping to `province` grouping (already done in current version).

---

### Task 11: Rewrite generator — Ablation Studies (NEW Section)

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py`

- [ ] **Step 1: Add Ablation 1 — Model comparison (RF, LR)**

```python
cells.append(md("## Ablation Studies"))

cells.append(md("### Ablation 1: Model Comparison\nXGBoost vs Random Forest vs Logistic Regression.\n\nSemua menggunakan fitur lengkap (15 features) + SMOTE + Optuna 30 trials."))

cells.append(code("""# @title Ablation 1: Random Forest (Optuna 30 trials)
from sklearn.ensemble import RandomForestClassifier

def rf_objective(trial):
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 100, 500),
        "max_depth": trial.suggest_int("max_depth", 3, 15),
        "min_samples_split": trial.suggest_int("min_samples_split", 2, 10),
        "min_samples_leaf": trial.suggest_int("min_samples_leaf", 1, 5),
        "max_features": trial.suggest_float("max_features", 0.5, 1.0),
        "random_state": 42,
        "n_jobs": -1,
    }
    cv_scores = []
    for train_idx, test_idx in tscv.split(X):
        X_tr, X_te = X[train_idx], X[test_idx]
        y_tr, y_te = y[train_idx], y[test_idx]
        min_c = min(pd.Series(y_tr).value_counts())
        k = min(3, min_c - 1)
        if k < 1: continue
        sm = SMOTE(random_state=42, k_neighbors=k)
        X_s, y_s = sm.fit_resample(X_tr, y_tr)
        model = RandomForestClassifier(**params)
        model.fit(X_s, y_s)
        pred = model.predict(X_te)
        cv_scores.append(f1_score(y_te, pred, average="weighted", zero_division=0))
    return np.mean(cv_scores) if cv_scores else 0.0

rf_study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=42))
rf_study.optimize(rf_objective, n_trials=30, show_progress_bar=True, n_jobs=-1)
print(f"RF Best F1: {rf_study.best_value:.4f}")
print(f"RF Best params: {rf_study.best_params}")"""))

cells.append(code("""# @title Ablation 1: Logistic Regression (Optuna 30 trials)
from sklearn.linear_model import LogisticRegression

def lr_objective(trial):
    params = {
        "C": trial.suggest_float("C", 0.01, 100, log=True),
        "max_iter": trial.suggest_int("max_iter", 500, 2000),
        "solver": trial.suggest_categorical("solver", ["lbfgs", "saga"]),
        "random_state": 42,
        "n_jobs": -1,
    }
    cv_scores = []
    for train_idx, test_idx in tscv.split(X):
        X_tr, X_te = X[train_idx], X[test_idx]
        y_tr, y_te = y[train_idx], y[test_idx]
        min_c = min(pd.Series(y_tr).value_counts())
        k = min(3, min_c - 1)
        if k < 1: continue
        sm = SMOTE(random_state=42, k_neighbors=k)
        X_s, y_s = sm.fit_resample(X_tr, y_tr)
        model = LogisticRegression(**params)
        model.fit(X_s, y_s)
        pred = model.predict(X_te)
        cv_scores.append(f1_score(y_te, pred, average="weighted", zero_division=0))
    return np.mean(cv_scores) if cv_scores else 0.0

lr_study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=42))
lr_study.optimize(lr_objective, n_trials=30, show_progress_bar=True, n_jobs=-1)
print(f"LR Best F1: {lr_study.best_value:.4f}")
print(f"LR Best params: {lr_study.best_params}")"""))

cells.append(code("""# @title Ablation 1: Comparison table
results = pd.DataFrame({
    "Model": ["XGBoost", "Random Forest", "Logistic Regression"],
    "Best F1 (CV)": [study.best_value, rf_study.best_value, lr_study.best_value],
}).round(4)
results["Rank"] = results["Best F1 (CV)"].rank(ascending=False).astype(int)
print(results.to_string(index=False))"""))
```

- [ ] **Step 2: Add Ablation 2 — Feature engineering impact**

```python
cells.append(md("### Ablation 2: Feature Engineering Impact\n15 features (full) vs 7 raw features.\n\nXGBoost + Optuna 30 trials untuk kedua konfigurasi."))

cells.append(code("""# @title Ablation 2: Raw features only (Optuna 30 trials)
X_raw = df[RAW_FEATURES].values

def raw_objective(trial):
    params = {
        "max_depth": trial.suggest_int("max_depth", 3, 7),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "n_estimators": trial.suggest_int("n_estimators", 100, 500),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
        "gamma": trial.suggest_float("gamma", 0.0, 5.0),
        "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 1.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 1.0, 10.0),
        "objective": "multi:softprob",
        "eval_metric": "mlogloss",
        "num_class": 4,
        "use_label_encoder": False,
        "random_state": 42,
        "tree_method": "hist",
    }
    cv_scores = []
    for train_idx, test_idx in tscv.split(X_raw):
        X_tr, X_te = X_raw[train_idx], X_raw[test_idx]
        y_tr, y_te = y[train_idx], y[test_idx]
        min_c = min(pd.Series(y_tr).value_counts())
        k = min(3, min_c - 1)
        if k < 1: continue
        sm = SMOTE(random_state=42, k_neighbors=k)
        X_s, y_s = sm.fit_resample(X_tr, y_tr)
        model = XGBClassifier(**params)
        model.fit(X_s, y_s, verbose=False)
        pred = model.predict(X_te)
        cv_scores.append(f1_score(y_te, pred, average="weighted", zero_division=0))
    return np.mean(cv_scores) if cv_scores else 0.0

raw_study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=42))
raw_study.optimize(raw_objective, n_trials=30, show_progress_bar=True, n_jobs=-1)
print(f"Raw features Best F1: {raw_study.best_value:.4f}")
print(f"Full features Best F1: {study.best_value:.4f}")
print(f"Delta: {study.best_value - raw_study.best_value:.4f}")"""))
```

---

### Task 12: Rewrite generator — Export & Inference (Section 11)

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py`

- [ ] **Step 1: Update export to include optuna_study.pkl**

Same as current export cell but add `optuna_study.pkl` and update `metadata.json` with Optuna best params, CV scores, and ablation results.

```python
cells.append(code("""# @title Save model artifacts
os.makedirs("xgboost_artifacts", exist_ok=True)

joblib.dump(best_model, "xgboost_artifacts/xgboost_model.pkl")
joblib.dump(FEATURE_COLUMNS, "xgboost_artifacts/feature_columns.pkl")

le = LabelEncoder()
le.fit(["Normal", "Waspada", "Siaga", "Ekstrem"])
joblib.dump(le, "xgboost_artifacts/label_encoder.pkl")

joblib.dump(study, "xgboost_artifacts/optuna_study.pkl")

metadata = {
    "trained_at": datetime.now().isoformat(),
    "n_features": len(FEATURE_COLUMNS),
    "feature_columns": FEATURE_COLUMNS,
    "risk_labels": RISK_LABELS,
    "best_params": study.best_params,
    "cv_f1_weighted": float(study.best_value),
    "test_accuracy": float(acc),
    "test_f1_weighted": float(f1),
    "test_f2_weighted": float(f2),
    "ablation": {
        "random_forest_f1": float(rf_study.best_value),
        "logistic_regression_f1": float(lr_study.best_value),
        "raw_features_f1": float(raw_study.best_value),
    },
    "n_train_samples": len(X_sm),
    "n_test_samples": len(X_test),
    "data_source": "Kaggle Indonesia Climate (Aceh + DIY Yogyakarta)",
    "validation": "TimeSeriesSplit 3-fold",
    "hpo": "Optuna TPE 50 trials + MedianPruner",
}
with open("xgboost_artifacts/metadata.json", "w") as f:
    json.dump(metadata, f, indent=2)

print("Saved to xgboost_artifacts/:")
for fname in os.listdir("xgboost_artifacts"):
    fpath = os.path.join("xgboost_artifacts", fname)
    print(f"  {fname} ({os.path.getsize(fpath):,} bytes)")"""))
```

- [ ] **Step 2: Keep download, demo inference, and threshold fallback cells unchanged**

Copy existing cells as-is. The demo inference sample dict must use the new `FEATURE_COLUMNS` names (e.g., `tp_roll_mean_6h` instead of `tp_roll_mean_3d`).

---

### Task 13: Regenerate notebook and verify

**Files:**
- Modify: `C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py` (final state)
- Generate: `SHAP-model-api\xgboost\xgboost_weather.ipynb`

- [ ] **Step 1: Add notebook builder at end of generator**

```python
notebook = {
    "nbformat": 4,
    "nbformat_minor": 5,
    "metadata": {
        "colab": {"provenance": [], "name": "xgboost_weather.ipynb"},
        "kernelspec": {"name": "python3", "display_name": "Python 3"},
        "language_info": {"name": "python", "version": "3.10.0"},
    },
    "cells": cells,
}

out_path = r"D:\Skripsi\gue\peringatancuacav3\SHAP-model-api\xgboost\xgboost_weather.ipynb"
os.makedirs(os.path.dirname(out_path), exist_ok=True)

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(notebook, f, indent=1, ensure_ascii=False)

print(f"Notebook written: {out_path}")
print(f"Total cells: {len(cells)}")
```

- [ ] **Step 2: Run generator and verify output**

Run: `python "C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py"`
Expected: `Notebook written: ... Total cells: ~40`

- [ ] **Step 3: Verify notebook cell count and section structure**

Run: `python -c "import json; nb=json.load(open(r'D:\Skripsi\gue\peringatancuacav3\SHAP-model-api\xgboost\xgboost_weather.ipynb')); [print(str(i)+': '+c['cell_type']+' '+(''.join(c['source'])[:70]).replace(chr(10),' ')) for i,c in enumerate(nb['cells'])]"`

Expected sections:
1. Setup (2 cells)
2. Data Collection (4 cells)
3. Load & Inspect (4 cells)
4. Preprocessing (1 cell)
5. Feature Engineering (1 cell)
6. Threshold Labeling (2 cells)
7. Train-Test Split (1 cell)
8. Optuna HPO (2 cells: optimize + visualize)
9. Final Training (1 cell)
10. Evaluation (2 cells: metrics + confusion matrix)
11. Visualization (3 cells: importance, SHAP, time-series)
12. Ablation Studies (4 cells: RF, LR, comparison, raw features)
13. Export & Inference (3 cells: save, download, demo)

- [ ] **Step 4: Commit**

```bash
git add "C:\Users\ASUS\AppData\Local\Temp\opencode\gen_notebook.py" "SHAP-model-api\xgboost\xgboost_weather.ipynb" "paper\docs\superpowers\specs\2026-05-23-xgboost-optuna-tuning-design.md"
git commit -m "feat: rewrite notebook with Optuna HPO, TimeSeriesSplit, production-aligned features, ablation studies"
```
