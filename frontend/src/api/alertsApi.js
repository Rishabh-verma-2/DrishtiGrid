/**
 * Client API for Plate Alerts management.
 */

export async function getPlateAlerts(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append("search", params.search);
  if (params.status && params.status !== "ALL") query.append("status", params.status);
  if (params.priority && params.priority !== "ALL") query.append("priority", params.priority);
  if (params.from) query.append("from", params.from);
  if (params.to) query.append("to", params.to);

  const res = await fetch(`/api/plate-alerts?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch alerts" }));
    throw new Error(err.error || "Failed to fetch alerts");
  }
  return res.json();
}

export async function getPlateAlertById(id) {
  const res = await fetch(`/api/plate-alerts/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch alert detail" }));
    throw new Error(err.error || "Failed to fetch alert detail");
  }
  return res.json();
}

export async function updateAlertStatus(id, status, notes) {
  const res = await fetch(`/api/plate-alerts/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to update alert status" }));
    throw new Error(err.error || "Failed to update alert status");
  }
  return res.json();
}
