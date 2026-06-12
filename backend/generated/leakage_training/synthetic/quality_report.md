# Synthetic Leakage Dataset Quality

- Generation version: `v1`
- Seed: `20260611`
- Anchor rows: `18`
- Synthetic rows: `360`
- Combined rows: `378`

## Target Summary

- Min leakage rate: `0.0000`
- Median leakage rate: `0.0918`
- Max leakage rate: `0.3863`
- Mean leakage rate: `0.1516`

## Family Counts

- `control_clean`: `84`
- `mixed_leakage`: `84`
- `reference_stress`: `42`
- `under_heavy`: `84`
- `unmatched_heavy`: `84`

## Target By Family

- `control_clean`: count=`84`, min=`0.0000`, p50=`0.0010`, max=`0.0200`, mean=`0.0046`
- `mixed_leakage`: count=`84`, min=`0.1906`, p50=`0.2358`, max=`0.2814`, mean=`0.2355`
- `reference_stress`: count=`42`, min=`0.0400`, p50=`0.0918`, max=`0.1400`, mean=`0.0888`
- `under_heavy`: count=`84`, min=`0.0300`, p50=`0.0500`, max=`0.0878`, mean=`0.0508`
- `unmatched_heavy`: count=`84`, min=`0.2943`, p50=`0.3464`, max=`0.3863`, mean=`0.3468`

## Logical Violations

- `avg_gt_max`: `0`
- `coverage_out_of_bounds`: `0`
- `min_gt_avg`: `0`
- `p50_gt_p95_provider`: `0`
- `p50_gt_p95_tenant`: `0`
- `rate_out_of_bounds`: `0`

## Feature/Target Correlations

- `batch_same_beneficiary_amount_density`: `0.3516`
- `canonicalization_error_rate`: `0.3974`
- `mapping_confidence_score`: `-0.6304`
- `missing_required_field_rate`: `0.4032`
- `parse_success_rate`: `-0.3482`
- `provider_missing_client_ref_rate`: `0.1898`
- `provider_missing_provider_ref_rate`: `0.4297`
- `provider_settlement_delay_p50_days`: `0.5216`
- `provider_settlement_delay_p95_days`: `0.5544`

## Learnability Notes

- Synthetic rows preserve leakage families instead of sampling columns independently.
- The dataset is suitable for quick prototyping but not final production validation.
- Currency/source/provider remain constant because the anchor corpus only contains Razorpay INR payouts.
