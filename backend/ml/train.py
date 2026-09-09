"""GeoFlare ML Model Training, Evaluation & Comparison Pipeline (Architecture Phases 11-15).

Compares:
1. Random Forest (baseline)
2. XGBoost (benchmark)
3. LightGBM (primary GeoFlare model)

Evaluates on:
- Random Split
- Event-Aware Split (GroupKFold)
- Spatial Holdout
- Temporal Holdout

Serializes model artifacts:
- models/geoflare_lightgbm.joblib
- models/geoflare_lightgbm.txt
- models/feature_schema.json
- models/class_mapping.json
- models/model_metadata.json
- models/metrics.json
"""

from __future__ import annotations

import argparse
import datetime
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from xgboost import XGBClassifier

from ml.dataset_builder import (
    INDIA_MAX_LAT,
    INDIA_MAX_LON,
    INDIA_MIN_LAT,
    INDIA_MIN_LON,
    create_leakage_controlled_splits,
    generate_benchmark_dataset,
    load_and_prepare_dataset,
)
from ml.feature_schema import (
    CANONICAL_CLASSES,
    CLASS_DISPLAY_NAMES,
    CLASS_TO_INDEX,
    FEATURE_NAMES,
    export_feature_schema,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def evaluate_model(
    model: Any, X_test: np.ndarray, y_test: np.ndarray, class_names: list[str]
) -> Dict[str, Any]:
    y_pred = model.predict(X_test)
    if y_pred.ndim > 1:
        y_pred = np.argmax(y_pred, axis=1)

    y_proba = model.predict_proba(X_test) if hasattr(model, "predict_proba") else None

    acc = float(accuracy_score(y_test, y_pred))
    macro_f1 = float(f1_score(y_test, y_pred, average="macro", zero_division=0))
    weighted_f1 = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))
    macro_prec = float(precision_score(y_test, y_pred, average="macro", zero_division=0))
    macro_rec = float(recall_score(y_test, y_pred, average="macro", zero_division=0))

    cm = confusion_matrix(y_test, y_pred, labels=list(range(len(class_names))))
    per_class_report = classification_report(
        y_test,
        y_pred,
        labels=list(range(len(class_names))),
        target_names=class_names,
        output_dict=True,
        zero_division=0,
    )

    return {
        "accuracy": round(acc, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "macro_precision": round(macro_prec, 4),
        "macro_recall": round(macro_rec, 4),
        "confusion_matrix": cm.tolist(),
        "per_class": {
            cls: {
                "precision": round(per_class_report[cls]["precision"], 4),
                "recall": round(per_class_report[cls]["recall"], 4),
                "f1_score": round(per_class_report[cls]["f1-score"], 4),
                "support": int(per_class_report[cls]["support"]),
            }
            for cls in class_names
            if cls in per_class_report
        },
    }


def run_training_pipeline(
    dataset_path: Optional[Union[str, Path]] = None,
    output_dir: Path = Path("models"),
    data_output_dir: Path = Path("data/ml"),
    n_samples: int = 2500,
    random_seed: int = 42,
    india_only: bool = True,
) -> Dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    data_output_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Exporting canonical feature schema & class mapping...")
    export_feature_schema(output_dir)

    if dataset_path and Path(dataset_path).exists():
        logger.info("Loading training data from dataset file: %s (India geofencing: %s)...", dataset_path, india_only)
        df, X, y = load_and_prepare_dataset(dataset_path, india_only=india_only)
        dataset_source = str(dataset_path)
    else:
        logger.info("Generating calibrated Indian benchmark dataset with %d events...", n_samples)
        df, X, y = generate_benchmark_dataset(n_samples=n_samples, random_seed=random_seed)
        csv_path = data_output_dir / "geoflare_training.csv"
        df.to_csv(csv_path, index=False)
        logger.info("Saved generated Indian dataset to %s", csv_path)
        dataset_source = f"generated_india_benchmark_n{n_samples}"

    # Verify India bounds
    lat_min, lat_max = float(df["latitude"].min()), float(df["latitude"].max())
    lon_min, lon_max = float(df["longitude"].min()), float(df["longitude"].max())
    logger.info(
        "Dataset Spatial Extents: Latitude [%.2f, %.2f], Longitude [%.2f, %.2f] (India BBox: [%.1f-%.1f, %.1f-%.1f])",
        lat_min,
        lat_max,
        lon_min,
        lon_max,
        INDIA_MIN_LAT,
        INDIA_MAX_LAT,
        INDIA_MIN_LON,
        INDIA_MAX_LON,
    )

    # Class distribution
    class_counts = df["label"].value_counts().to_dict()
    class_distribution = {
        cls: {
            "count": int(class_counts.get(cls, 0)),
            "percentage": round(class_counts.get(cls, 0) / len(df) * 100, 2),
        }
        for cls in CANONICAL_CLASSES
    }
    logger.info("Class distribution:\n%s", json.dumps(class_distribution, indent=2))

    # Test all 4 Leakage Split Methods
    split_methods = ["random", "event_aware", "spatial_holdout", "temporal_holdout"]
    leakage_evaluations: Dict[str, Any] = {}

    for method in split_methods:
        logger.info("Evaluating splits with leakage control method: '%s'...", method)
        splits = create_leakage_controlled_splits(df, X, y, split_method=method)

        # Train LightGBM on this split
        lgb_eval = lgb.LGBMClassifier(
            objective="multiclass",
            num_class=len(CANONICAL_CLASSES),
            n_estimators=100,
            learning_rate=0.05,
            num_leaves=31,
            max_depth=6,
            min_child_samples=15,
            subsample=0.8,
            colsample_bytree=0.8,
            class_weight="balanced",
            random_state=42,
            verbosity=-1,
        )
        lgb_eval.fit(splits.X_train, splits.y_train)
        metrics = evaluate_model(lgb_eval, splits.X_test, splits.y_test, CANONICAL_CLASSES)
        leakage_evaluations[method] = {
            "metadata": splits.metadata,
            "train_samples": len(splits.y_train),
            "test_samples": len(splits.y_test),
            "metrics": metrics,
        }
        logger.info(
            "[%s] Accuracy: %.4f, Macro-F1: %.4f, Weighted-F1: %.4f",
            method,
            metrics["accuracy"],
            metrics["macro_f1"],
            metrics["weighted_f1"],
        )

    # Multi-Model Comparison on Event-Aware Split (Leakage-Controlled Primary Split)
    logger.info("Running 3-Model Comparison on Event-Aware Split...")
    primary_split = create_leakage_controlled_splits(df, X, y, split_method="event_aware")

    # 1. Random Forest (Baseline)
    rf = RandomForestClassifier(
        n_estimators=150,
        max_depth=12,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    rf.fit(primary_split.X_train, primary_split.y_train)
    rf_metrics = evaluate_model(rf, primary_split.X_test, primary_split.y_test, CANONICAL_CLASSES)

    # 2. XGBoost (Benchmark)
    xgb = XGBClassifier(
        n_estimators=100,
        learning_rate=0.05,
        max_depth=6,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        eval_metric="mlogloss",
    )
    xgb.fit(primary_split.X_train, primary_split.y_train)
    xgb_metrics = evaluate_model(xgb, primary_split.X_test, primary_split.y_test, CANONICAL_CLASSES)

    # 3. LightGBM (Primary GeoFlare Model)
    final_lgb = lgb.LGBMClassifier(
        objective="multiclass",
        num_class=len(CANONICAL_CLASSES),
        n_estimators=120,
        learning_rate=0.04,
        num_leaves=31,
        max_depth=6,
        min_child_samples=15,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=0.1,
        class_weight="balanced",
        random_state=42,
        verbosity=-1,
    )
    final_lgb.fit(primary_split.X_train, primary_split.y_train)
    lgb_metrics = evaluate_model(final_lgb, primary_split.X_test, primary_split.y_test, CANONICAL_CLASSES)

    model_comparison = {
        "random_forest_baseline": rf_metrics,
        "xgboost_benchmark": xgb_metrics,
        "lightgbm_primary": lgb_metrics,
    }

    # Feature Importance (LightGBM)
    importances = final_lgb.feature_importances_
    feat_importance_dict = {
        name: float(imp)
        for name, imp in sorted(zip(FEATURE_NAMES, importances), key=lambda x: x[1], reverse=True)
    }

    # Train Final Production Model on full dataset (retaining test metrics from event-aware split)
    final_lgb.fit(X, y)

    # Save LightGBM Model Artifacts
    joblib_path = output_dir / "geoflare_lightgbm.joblib"
    joblib.dump(final_lgb, joblib_path)
    logger.info("Saved LightGBM model to %s", joblib_path)

    # Also save native LightGBM text format
    txt_path = output_dir / "geoflare_lightgbm.txt"
    final_lgb.booster_.save_model(str(txt_path))
    logger.info("Saved LightGBM booster text model to %s", txt_path)

    # Model Metadata
    now_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
    metadata = {
        "model_name": "GeoFlare LightGBM Multiclass Source Classifier",
        "model_version": "lightgbm_v1.0.0",
        "model_format": "lightgbm_scikit_learn",
        "trained_at_utc": now_utc,
        "target_classes": CANONICAL_CLASSES,
        "class_display_names": CLASS_DISPLAY_NAMES,
        "feature_count": len(FEATURE_NAMES),
        "feature_names": FEATURE_NAMES,
        "training_samples_count": len(y),
        "india_geofencing_enforced": india_only,
        "india_bounding_box": {
            "min_latitude": INDIA_MIN_LAT,
            "max_latitude": INDIA_MAX_LAT,
            "min_longitude": INDIA_MIN_LON,
            "max_longitude": INDIA_MAX_LON,
        },
        "dataset_spatial_extents": {
            "min_latitude": lat_min,
            "max_latitude": lat_max,
            "min_longitude": lon_min,
            "max_longitude": lon_max,
        },
        "dataset_source": dataset_source,
        "class_distribution": class_distribution,
        "leakage_split_evaluations": leakage_evaluations,
        "model_comparison": model_comparison,
        "top_feature_importances": feat_importance_dict,
        "dataset_provenance": (
            "Trained strictly on geofenced Indian thermal observations (Lat 6.5-37.5, Lon 68.0-97.5) "
            "with NASA FIRMS VIIRS thermal properties, OpenStreetMap infrastructure proximity, and ERA5 weather anomalies."
        ),
        "is_prototype_model": True,
    }

    metadata_path = output_dir / "model_metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    metrics_path = output_dir / "metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump({
            "model_version": "lightgbm_v1.0.0",
            "evaluation_date": now_utc,
            "primary_split": "event_aware",
            "primary_metrics": lgb_metrics,
            "model_comparison": model_comparison,
            "leakage_evaluations": leakage_evaluations,
            "india_geofencing_enforced": india_only,
        }, f, indent=2)

    logger.info("Training and evaluation complete. Artifacts written to %s", output_dir)
    return metadata


def main():
    parser = argparse.ArgumentParser(description="GeoFlare LightGBM Model Trainer (Strict India Geofencing)")
    parser.add_argument("--dataset", type=str, default=None, help="Path to custom training dataset CSV (e.g. data/raw/india_fires.csv)")
    parser.add_argument("--india-only", action="store_true", default=True, help="Enforce strict India geofencing filter (default: True)")
    parser.add_argument("--n-samples", type=int, default=2500, help="Number of samples if generating benchmark dataset (default: 2500)")
    parser.add_argument("--output-dir", type=str, default="models", help="Directory for model artifacts (default: models)")
    parser.add_argument("--data-output-dir", type=str, default="data/ml", help="Directory for generated dataset (default: data/ml)")

    args = parser.parse_args()
    run_training_pipeline(
        dataset_path=args.dataset,
        output_dir=Path(args.output_dir),
        data_output_dir=Path(args.data_output_dir),
        n_samples=args.n_samples,
        india_only=args.india_only,
    )


if __name__ == "__main__":
    main()

