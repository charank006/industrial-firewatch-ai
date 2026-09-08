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
 * Defaults to `mock`. The backend cannot yet supply classification, land
 * cover or location names (Phase 4/5), so switching the default before those
 * land would show "Unknown Anomaly, no reasoning steps" on every card - a
 * visible regression even though no component changed.
 */
export type DataSource = 'mock' | 'api';

export const DATA_SOURCE: DataSource =
  (import.meta.env.VITE_DATA_SOURCE as DataSource) === 'api' ? 'api' : 'mock';

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
}

export interface ApiFacility {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  location: string;
  status: string;
  baseline_frp: number;
  current_frp: number;
  last_detected: string | null;
  total_events_past_90_days: number;
  risk_buffer_radius_km: number;
  emergency_contact: string | null;
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
  return request<{ total: number; facilities: ApiFacility[] }>('/api/facilities');
}

export function fetchSystemStatus() {
  return request<Record<string, unknown>>('/api/system/status');
}
