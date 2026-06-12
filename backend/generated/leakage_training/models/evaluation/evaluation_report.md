# Leakage Model Evaluation

## Data Used
- Combined training-style rows: `378`
- Real uploaded anchor batches: `18`
- Model: `generated\leakage_training\models\leakage_catboost_regressor.cbm`

## Grouped Cross-Validation
- Rate weighted MAE: `0.0540`
- Rate RMSE: `0.0689`
- Rate R-square: `0.6526`
- Amount weighted MAE: `29561.38`

## Grouped Baseline
- Rate weighted MAE: `0.1271`
- Rate R-square: `-0.2175`
- Amount weighted MAE: `70568.33`

## In-Sample Fit On 378 Rows
- Rate MAE: `0.0127`
- Rate RMSE: `0.0321`
- Rate R-square: `0.9423`
- Amount MAE: `7018.90`

## Real Uploaded Batches
These are the 18 batch files that were actually uploaded during the earlier replay/extraction run.
- Final model fit on those 18 rows: rate MAE=`0.0827`, rate R-square=`0.2786`, amount MAE=`45568.55`
- Out-of-fold estimate on those same 18 rows: rate MAE=`0.1352`, rate R-square=`-0.3840`, amount MAE=`75064.26`
- Current system label vs truth on those 18 rows: rate MAE=`0.0647`, rate R-square=`0.4131`, amount MAE=`36961.88`

## Outputs
- Comparison CSV: `generated\leakage_training\models\evaluation\real_batch_prediction_comparison.csv`
- Family summary CSV: `generated\leakage_training\models\evaluation\real_batch_family_summary.csv`
- JSON summary: `generated\leakage_training\models\evaluation\evaluation_summary.json`
