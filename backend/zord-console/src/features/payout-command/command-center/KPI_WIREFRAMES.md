# KPI Wireframes

This file documents the shared navy hero KPI pattern used by:
- Intent Journal (`5` buckets)
- Settlement Journal (`5` buckets)
- Matching Confidence (`4` buckets)
- Evidence / Proof (`6` buckets)

## Navy Hero Structure

1. Eyebrow
2. Primary hero value
3. Delta/status pill
4. Subcopy
5. Optional footer actions
6. Bucket grid with all KPIs for the page

## Grid Layouts

- `N=4`: `grid-cols-2 xl:grid-cols-4`
- `N=5`: `grid-cols-2 xl:grid-cols-5`
- `N=6`: `grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`

## Test IDs

Hero root:
- `intent-kpi-hero`
- `settlement-kpi-hero`
- `ambiguity-kpi-hero`
- `evidence-kpi-hero`

Bucket IDs:
- `${heroTestId}-bucket-${index}-${normalized-label}`
