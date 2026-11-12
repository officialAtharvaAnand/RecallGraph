export type User = { id: string; email: string; role: 'admin' | 'analyst'; tokenVersion: number };
export type Service = {
  service_id: string;
  service_name: string;
  incident_count: number;
  active_count: number;
  critical_active_count: number;
};
export type CatalogItem = { id: string; label: string };
export type Incident = {
  id: string;
  title: string;
  summary: string;
  service_id: string;
  service_name: string;
  severity: number;
  status: 'open' | 'investigating' | 'resolved';
  occurred_at: string;
  root_cause: string | null;
  category_label: string | null;
  symptoms: string[];
};
export type Event = {
  id: number;
  event_type: string;
  detail: Record<string, unknown>;
  happened_at: string;
  incident_title: string;
  actor_email: string | null;
};
export type Insights = {
  summary: Service[];
  repeat: { service_name: string; failures: number }[];
  symptoms: CatalogItem[];
  categories: CatalogItem[];
  resolutionStats: {
    service_name: string;
    category_label: string;
    resolution_count: number;
    avg_time_to_resolve_hours: number;
  }[];
  symptomCooccurrence: { first: string; second: string; incidents: number }[];
  graphAvailable: boolean;
};
export type AdminData = {
  services: { id: string; name: string; owner_team: string }[];
  symptoms: CatalogItem[];
  categories: CatalogItem[];
  dependencies: { service_id: string; depends_on_service_id: string }[];
  events: Event[];
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.body ? { 'content-type': 'application/json' } : {}),
      ...options?.headers,
    },
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String(data.error)
        : `Request failed (${response.status})`;
    if (response.status === 401 && path !== '/api/auth') {
      window.dispatchEvent(new window.Event('recallgraph:unauthorized'));
    }
    throw new ApiError(response.status, message);
  }
  return data as T;
}

export function body(value: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(value) };
}
