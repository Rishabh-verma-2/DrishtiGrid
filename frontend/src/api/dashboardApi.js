/**
 * Client API for dashboard statistics and audit logs.
 */

export async function getDashboardStats() {
  const res = await fetch("/api/dashboard/stats");
  if (!res.ok) {
    throw new Error("Failed to fetch dashboard statistics");
  }
  return res.json();
}

export async function getAuditLogs() {
  const res = await fetch("/api/dashboard/audit-logs");
  if (!res.ok) {
    throw new Error("Failed to fetch audit logs");
  }
  return res.json();
}
