/**
 * Backend HTTP client.
 *
 * In dev, Vite proxies `/api` to the backend on :8001, so VITE_API_BASE_URL
 * stays empty and there is no CORS involved at all.
 */

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Which data source the app runs on.
 *
 * Defaults to `api` as of Phase 6: the backend now supplies classification,
 * land cover, location names, weather baselines, surroundings and impact, so
 * live data is strictly richer than the bundled mocks.
 *
 * Set VITE_DATA_SOURCE=mock to run the dashboard with no backend at all -
 * useful for UI work, demos, and as an offline fallback.
 */
export type DataSource = 'mock' | 'api';

export const DATA_SOURCE: DataSource =
  (import.meta.env.VITE_DATA_SOURCE as DataSource) === 'mock' ? 'mock' : 'api';

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      ...init,
    });
  } catch (cause) {
    throw new ApiError(
      `Cannot reach the API at ${API_BASE_URL || 'the dev proxy'}${path}. Is the backend running on :8001?`,
    );
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      // A non-JSON error body is not itself an error worth surfacing.
    }
    throw new ApiError(`${path} failed: ${detail}`, response.status);
  }

  return (await response.json()) as T;
}

// --- Wire types (snake_case, exactly as the backend sends them) ------------

export interface ApiReasoningStep {
  step_index: number;
  label: string;
  detail: string;
  status: 'passed' | 'warning' | 'critical' | 'neutral';
}

export interface ApiFireEvent {
  fire_event_id: string;
  latitude: number;
  longitude: number;
  first_detected: string | null;
  last_detected: string | null;
  time_formatted: string | null;
  day_night: string | null;
  status: string;
  detection_count: number;
  frp_latest_mw: number;
  frp_max_mw: number;
  frp_mean_mw: number;
  brightness_k: number | null;
  detection_confidence_pct: number | null;
  is_persistent?: boolean;
  active_days_7d?: number;
  persistence_status?: string;
  prediction: string | null;
  classification_confidence_pct: number | null;
  probabilities: Record<string, number> | null;
  model_version: string;
  severity: string;
  severity_is_provisional: boolean;
  land_cover: string | null;
  location_name: string;
  nearest_facility_id: string | null;
  nearest_facility_name: string | null;
  nearest_facility_distance_km: number | null;
  recurrence_count: number;
  history_days: number;
  analysis_status: string;
  surroundings_status: string | null;
  is_new: boolean;
  reasoning_steps: ApiReasoningStep[];
  suggested_action: string;
  /** Detection validity - answered separately from, and before, the class. */
  validity: {
    verdict: string;
    p_real: number | null;
    confidence_pct: number;
    concerns: string[];
    model_version: string | null;
  } | null;
}

export interface ApiFacility {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  location: string;
  status: string;
  named: boolean;
  nearest_distance_m: number | null;
  current_frp: number;
  last_detected: string | null;
  event_count: number;
  fire_event_ids: string[];
}


export interface FiresQuery {
  bbox?: string;
  since?: string;
  status?: 'active' | 'contained' | 'all';
  minFrp?: number;
  limit?: number;
}

export function fetchFires(query: FiresQuery = {}) {
  const params = new URLSearchParams();
  if (query.bbox) params.set('bbox', query.bbox);
  if (query.since) params.set('since', query.since);
  if (query.status) params.set('status', query.status);
  if (query.minFrp) params.set('min_frp', String(query.minFrp));
  params.set('limit', String(query.limit ?? 500));

  return request<{ total: number; history_days: number; fires: ApiFireEvent[] }>(
    `/api/fires?${params.toString()}`,
  );
}

export function fetchFacilities() {
  return request<{
    total: number;
    source: string;
    caveat: string;
    facilities: ApiFacility[];
  }>('/api/facilities');
}

export function fetchSystemStatus() {
  return request<Record<string, unknown>>('/api/system/status');
}

// --- Detail endpoints (Phase 5/6) ----------------------------------------

export interface ApiAnalysis {
  fire: ApiFireEvent;
  weather: Record<string, any> | null;
  surroundings: Record<string, any> | null;
  prediction: Record<string, any> | null;
  impact: Record<string, any> | null;
}

/** Everything about one fire in a single round trip. */
export function fetchFireAnalysis(fireId: string) {
  return request<ApiAnalysis>(`/api/fires/${encodeURIComponent(fireId)}/analysis`);
}

export function fetchFireDetections(fireId: string) {
  return request<{
    fire_event_id: string;
    count: number;
    detections: Array<{
      acquisition_time: string;
      time_formatted: string | null;
      frp_mw: number;
      brightness_k: number | null;
      confidence_pct: number | null;
      satellite: string;
      instrument: string;
    }>;
  }>(`/api/fires/${encodeURIComponent(fireId)}/detections`);
}

export function fetchDashboardSummary() {
  return request<Record<string, any>>('/api/dashboard/summary');
}

export function fetchMlMetrics() {
  return request<Record<string, any>>('/api/ml/metrics');
}

export function fetchMlSchema() {
  return request<Record<string, any>>('/api/ml/schema');
}

export interface SyncFirmsResponse {
  status: string;
  message: string;
  total_detections: number;
  class_counts: Record<string, number>;
  updated_at: string;
}

export function syncLiveFirms(dayRange: number = 3) {
  return request<SyncFirmsResponse>(`/api/firms/sync?day_range=${dayRange}`, {
    method: 'POST',
  });
}
