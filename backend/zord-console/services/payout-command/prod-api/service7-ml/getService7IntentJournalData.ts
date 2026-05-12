import { fetchProdJsonGet } from '../fetchProdJsonGet'
import { withQuery } from './service7MlQuery'
import type { Service7KpiQuery, Service7MetricResponse, Service7MlPredictionsResponse } from './service7MlTypes'

export const S7_IJ_BATCH_QUALITY_PATH = '/api/prod/intelligence/kpis/pattern/batch-quality'
export const S7_IJ_AVG_ATTACHMENT_CONFIDENCE_PATH = '/api/prod/intelligence/kpis/ambiguity/avg-confidence'
export const S7_IJ_BATCH_ANOMALY_PATH = '/api/prod/intelligence/ml/anomaly/batch'
export const S7_IJ_ML_PREDICTIONS_PATH = '/api/prod/intelligence/ml/predictions'

export async function getService7IntentJournalBatchQuality(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_IJ_BATCH_QUALITY_PATH, query))
}

export async function getService7IntentJournalAvgAttachmentConfidence(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_IJ_AVG_ATTACHMENT_CONFIDENCE_PATH, query))
}

export async function getService7IntentJournalBatchAnomalyScore(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_IJ_BATCH_ANOMALY_PATH, query))
}

export async function getService7IntentJournalBatchAnomalyPredictions(
  scopeRef: string,
): Promise<Service7MlPredictionsResponse | null> {
  const url = `${S7_IJ_ML_PREDICTIONS_PATH}?family=BATCH_ANOMALY&scope_type=BATCH&scope_ref=${encodeURIComponent(scopeRef)}`
  return fetchProdJsonGet<Service7MlPredictionsResponse>(url)
}

