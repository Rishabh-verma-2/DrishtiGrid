/**
 * Client API for Plate Records management.
 */

export async function getPlateRecords(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append("search", params.search);
  if (params.status && params.status !== "ALL") query.append("status", params.status);
  if (params.category && params.category !== "ALL") query.append("category", params.category);
  if (params.priority && params.priority !== "ALL") query.append("priority", params.priority);

  const res = await fetch(`/api/plate-records?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch records" }));
    throw new Error(err.error || "Failed to fetch records");
  }
  return res.json();
}

export async function getPlateRecordById(id) {
  const res = await fetch(`/api/plate-records/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch record detail" }));
    throw new Error(err.error || "Failed to fetch record detail");
  }
  return res.json();
}

export async function createPlateRecord(data) {
  const res = await fetch("/api/plate-records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create plate record" }));
    throw new Error(err.error || "Failed to create plate record");
  }
  return res.json();
}

export async function updatePlateRecord(id, updates) {
  const res = await fetch(`/api/plate-records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to update plate record" }));
    throw new Error(err.error || "Failed to update plate record");
  }
  return res.json();
}

export async function deletePlateRecord(id, hard = false) {
  const res = await fetch(`/api/plate-records/${id}?hard=${hard}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to delete plate record" }));
    throw new Error(err.error || "Failed to delete plate record");
  }
  return res.json();
}
