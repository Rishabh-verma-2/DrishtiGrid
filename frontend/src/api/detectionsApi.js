/**
 * Client API for querying stored MongoDB plate detections.
 */

export async function getStoredPlateDetections(filters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.append("search", filters.search);
  if (filters.match_status && filters.match_status !== "ALL") params.append("match_status", filters.match_status);
  if (filters.source_type && filters.source_type !== "ALL") params.append("source_type", filters.source_type);
  if (filters.car_color && filters.car_color !== "ALL") params.append("car_color", filters.car_color);
  if (filters.limit) params.append("limit", filters.limit);

  const url = `/api/ai/detections${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch detections (${res.status})`);
  }
  const data = await res.json();
  return data.detections || [];
}
