# XGBoost Optuna Tuning Design

## Status

Approved. Ready for implementation plan.

## Problem Statement

Notebook training XGBoost saat ini menggunakan GridSearchCV brute-force (2,592 kombinasi) dengan StratifiedKFold(shuffle=True) yang merusak temporal ordering. Fitur engineering di notebook (window harian 3d/7d) tidak compatible dengan production service (window per-jam 6h/24h). Tidak ada early stopping, dan evaluasi hanya f1-weighted tanpa metrik recall-oriented.

## Goals

1. Ganti GridSearchCV dengan Optuna (Bayesian HPO + pruning) — lebih efisien, lebih ilmiah.
2. Align 15 fitur notebook ke production naming convention (tp_roll_mean_6h, tp_cumsum_24h, dll).
3. Gunakan TimeSeriesSplit 3-fold (no shuffle) untuk validasi time-series yang benar.
4. Tambah early stopping pada final training.
5. Tambah metrik evaluasi recall-oriented (F2-score, recall per-class, PR-AUC).
6. Sediakan 2 ablation studies: model comparison (RF, LR) dan feature engineering impact.

## Decisions

### D1: Tuning Framework → Optuna

- **TPESampler** (Tree-structured Parzen Estimator) — default Optuna, state-of-the-art Bayesian HPO (Akiba et al., 2019).
- **MedianPruner** — stop trial jika intermediate score < median setelah 10 startup trials. Menghemat ~40% komputasi.
- **50 trials** — cukup untuk 9 parameter pada data 27K rows. Estimasi 15-20 menit di Colab.
- **Alasan:** Lebih efisien daripada RandomizedSearchCV (30-50 trial Optuna ≈ 200+ random). Visualisasi built-in (optimization history, param importance) → material kuat untuk skripsi.

### D2: Validation Strategy → TimeSeriesSplit 3-fold

- sklearn `TimeSeriesSplit(n_splits=3)` — tidak shuffle, masa depan tidak pernah terpapar ke masa lalu.
- SMOTE diterapkan hanya pada train set masing-masing fold (test set tetap asli).
- Final model retrain pada full train data dengan early stopping.

```
Fold 1: Train [2010-2016]  Test [2017-2018]
Fold 2: Train [2010-2018]  Test [2019-2020]
Fold 3: Train [2010-2020]  Test [2021-2022]
```

- **Alasan:** Temporal split 80/20 tunggal hanya 1 evaluasi. TimeSeriesSplit memberikan 3 evaluasi yang lebih reliable untuk generalisasi time-series.

### D3: Feature Alignment → Production Naming

15 fitur diselaraskan dengan `xgboost_service.py`:

| # | Feature | Notebook (Kaggle) | Production |
|---|---------|-------------------|------------|
| 1 | `suhu` | Tavg | t |
| 2 | `kelembapan` | RH_avg | hu |
| 3 | `kecepatan_angin_knot` | ff_avg / 1.852 | ws / 1.852 |
| 4 | `curah_hujan` | RR | tp |
| 5 | `tutupan_awan` | NaN → fill median | tcc |
| 6 | `arah_angin_sin` | sin(ddd_x) | sin(DIRECTION_MAP[wd]) |
| 7 | `arah_angin_cos` | cos(ddd_x) | cos(DIRECTION_MAP[wd]) |
| 8 | `tp_roll_mean_6h` | rolling(2) mean RR | current + prev / 2 |
| 9 | `tp_roll_max_6h` | rolling(2) max RR | max(current, prev) |
| 10 | `hu_delta_3h` | diff() RH_avg | current_hu - prev_hu |
| 11 | `ws_delta_3h` | diff() ff_avg_knot | current_ws - prev_ws |
| 12 | `t_delta_3h` | diff() Tavg | current_t - prev_t |
| 13 | `tp_cumsum_24h` | rolling(8) sum RR | akumulasi 8 slots |
| 14 | `hour_sin` | sin(2pi * 12 / 24) | sin(2pi * hour / 24) |
| 15 | `hour_cos` | cos(2pi * 12 / 24) | cos(2pi * hour / 24) |

**Compromise acknowledged:** Data Kaggle harian (1 row/hari) tapi nama fitur mengikuti konvensi production (6h, 3h, 24h). Window rolling di notebook memiliki makna yang berbeda: rolling(2) = 2 hari (bukan 12 jam). hour_sin/cos = konstan karena data Kaggle tidak punya informasi jam. tutupan_awan = NaN di Kaggle (fill median).

### D4: Optuna Parameter Ranges

| Parameter | Range | Type | Alasan |
|-----------|-------|------|--------|
| `max_depth` | 3-7 | int | Shallow tree mencegah overfit (Chen & Guestrin, 2016) |
| `learning_rate` | 0.01-0.3 | float log | Typical XGBoost range, log-uniform untuk eksplorasi halus |
| `n_estimators` | 100-500 | int | Akan di-override oleh early stopping di final training |
| `subsample` | 0.6-1.0 | float | Stochastic gradient boosting (Friedman, 2002) |
| `colsample_bytree` | 0.6-1.0 | float | Feature subsampling, cegah dominance fitur tertentu |
| `min_child_weight` | 1-10 | int | Min sample per leaf, regularisasi noise |
| `gamma` | 0-5.0 | float | Min loss reduction untuk split |
| `reg_alpha` | 0-1.0 | float | L1 regularization (feature selection otomatis) |
| `reg_lambda` | 1-10 | float | L2 regularization (smooth weights) |

### D5: Metrik Evaluasi

| Metrik | Priority | Alasan |
|--------|----------|--------|
| **F1-weighted** | #1 | Optuna objective, keseimbangan overall |
| **Recall per-class** | #1 | Fokus kelas Ekstrem — false negative paling berbahaya |
| **F2-score** | #1 | Recall-oriented, appropriate untuk early warning system |
| **Precision macro** | #2 | Keseimbangan dengan recall |
| **PR-AUC per-class** | #2 | Lebih informatif daripada ROC-AUC untuk data imbalanced |
| **Confusion Matrix** | #3 | Visual cepat |
| **Classification Report** | #3 | Detail per kelas |
| **Accuracy** | #3 | Referensi saja, tidak primary |

### D6: Ablation Studies

| # | Eksperimen | Optuna Trials | Tujuan |
|---|-----------|---------------|--------|
| Main | XGBoost + FE + SMOTE | 50 | Model utama |
| Ablation 1 | RF + FE + SMOTE, LR + FE + SMOTE | 30 each | Bukti XGBoost terbaik |
| Ablation 2 | XGBoost + 7 raw features + SMOTE | 30 | Bukti FE membantu |

Semua eksperimen menggunakan TimeSeriesSplit 3-fold yang sama, random_state=42. Ablation menggunakan Optuna juga (bukan default params) agar perbandingan fair.

### D7: Early Stopping Configuration

- `early_stopping_rounds=30` pada final training
- Eval set: 20% terakhir dari SMOTE-resampled train data (time-ordered)
- Model disimpan di iteration terbaik, bukan iteration terakhir
- Metric monitoring: `mlogloss`

## Pipeline Architecture

```
Data (Kaggle, ~27K rows, Aceh + Yogyakarta)
│
├── Section 1-3: Collection, Preprocessing, Feature Engineering
│   → 15 features aligned to production
│   → Threshold labeling → 4 classes
│
├── Section 4: TimeSeriesSplit 3-fold
│   ├── Fold 1: Train [2010-2016]  Test [2017-2018]
│   ├── Fold 2: Train [2010-2018]  Test [2019-2020]
│   └── Fold 3: Train [2010-2020]  Test [2021-2022]
│
├── Section 5: Optuna HPO (50 trials)
│   ├── Objective: F1-weighted via TimeSeriesSplit CV
│   ├── SMOTE per-fold
│   ├── TPE sampler + MedianPruner (n_startup=10)
│   └── Output: best_params, best_trial
│
├── Section 6: Final Training
│   ├── Best params + early_stopping_rounds=30
│   ├── Full train data + SMOTE
│   └── Eval set for early stopping
│
├── Section 7: Evaluation (test set asli, never SMOTE'd)
│   ├── F1-weighted, F2, Recall, PR-AUC, CM
│   └── Threshold comparison
│
├── Section 8: Ablation Studies
│   ├── A1: RF vs LR vs XGBoost
│   └── A2: 15 features vs 7 raw features
│
├── Section 9: Visualization
│   ├── Feature importance (weight + gain)
│   ├── SHAP summary + bar
│   ├── Optuna optimization history
│   ├── Optuna parameter importance
│   └── Time-series prediction per province
│
└── Section 10: Export
    ├── xgboost_model.pkl
    ├── feature_columns.pkl
    ├── label_encoder.pkl
    ├── metadata.json
    └── optuna_study.pkl
```

## Export Artifacts

| File | Isi | Consumer |
|------|-----|----------|
| `xgboost_model.pkl` | Model final (joblib) | `xgboost_service.py` |
| `feature_columns.pkl` | List 15 nama fitur (ordered) | `xgboost_service.py` |
| `label_encoder.pkl` | LabelEncoder [Normal, Waspada, Siaga, Ekstrem] | `xgboost_service.py` |
| `metadata.json` | Best params, CV scores, test metrics, data source | Documentation |
| `optuna_study.pkl` | Optuna study object | Resume/analyze |

## Dependencies Added

- `optuna` — HPO framework
- `sklearn.metrics.fbeta_score` — F2-score (already in sklearn)

## Constraints

- Notebook berjalan di Google Colab (free tier, ~12GB RAM, no GPU needed)
- Training time target: < 30 menit total (main + ablation)
- Model `.pkl` harus compatible dengan existing `xgboost_service.py` tanpa perubahan kode backend

## References

Will be populated by journal scraper.
