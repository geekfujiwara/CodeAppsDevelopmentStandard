import { initializeLogger } from '@microsoft/power-apps/telemetry'
import type {
  Metric,
  NetworkRequestMetricData,
  SessionLoadSummaryMetricData,
} from '@microsoft/power-apps/telemetry'

const ODATA_KEY_PATTERN = /\([^/)]+\)/g
const RECORD_ID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

export const TELEMETRY_EVENT_NAME = 'code-apps:telemetry'

export type SanitizedMetric =
  | {
      type: 'sessionLoadSummary'
      data: SessionLoadSummaryMetricData
    }
  | {
      type: 'networkRequest'
      data: NetworkRequestMetricData
    }

export type TelemetrySink = (metric: SanitizedMetric) => void

const dispatchTelemetryEvent: TelemetrySink = (metric) => {
  window.dispatchEvent(new CustomEvent(TELEMETRY_EVENT_NAME, { detail: metric }))
}

export function sanitizeTelemetryUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin)
    parsed.search = ''
    parsed.hash = ''
    parsed.pathname = parsed.pathname
      .replace(ODATA_KEY_PATTERN, '([id])')
      .replace(RECORD_ID_PATTERN, '[id]')
    return parsed.toString()
  } catch {
    return '[invalid-url]'
  }
}

function sanitizeMetric(metric: Metric): SanitizedMetric {
  if (metric.type === 'networkRequest') {
    return {
      type: metric.type,
      data: {
        ...metric.data,
        url: sanitizeTelemetryUrl(metric.data.url),
      },
    }
  }

  return {
    type: metric.type,
    data: metric.data,
  }
}

export async function initializeTelemetry(sink: TelemetrySink = dispatchTelemetryEvent): Promise<void> {
  await initializeLogger({
    logMetric: (metric) => sink(sanitizeMetric(metric)),
  })
}