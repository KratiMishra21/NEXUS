

const BASE_URL = import.meta.env.VITE_INSIGHTOS_API_URL || "http://localhost:8000";


export async function emitEvents(events) {
  if (!events || events.length === 0) return;

  const response = await fetch(`${BASE_URL}/api/v1/telemetry/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-InsightOS-SDK-Version": "1.0.0",
    },
    body: JSON.stringify({ events, emittedAt: new Date().toISOString() }),
  });

  if (!response.ok) {
    throw new Error(`[InsightOS API] Emit failed: ${response.status}`);
  }
}


export async function fetchDashboardAnalytics({ maskedTenantId, dateFrom, dateTo }) {
  const params = new URLSearchParams({
    tenantId: maskedTenantId,
    ...(dateFrom && { from: dateFrom }),
    ...(dateTo && { to: dateTo }),
  });

  const response = await fetch(`${BASE_URL}/api/v1/analytics/dashboard?${params}`);
  if (!response.ok) throw new Error(`[InsightOS API] Analytics fetch failed: ${response.status}`);
  return response.json();
}


export async function fetchAdoptionHeatmap(maskedTenantId) {
  const response = await fetch(
    `${BASE_URL}/api/v1/analytics/adoption?tenantId=${maskedTenantId}`
  );
  if (!response.ok) throw new Error("[InsightOS API] Heatmap fetch failed");
  return response.json();
}


export async function fetchJourneyFunnel(journeyName, maskedTenantId) {
  const response = await fetch(
    `${BASE_URL}/api/v1/analytics/journey-funnel?journey=${journeyName}&tenantId=${maskedTenantId}`
  );
  if (!response.ok) throw new Error("[InsightOS API] Journey funnel fetch failed");
  return response.json();
}


export async function updateTelemetryConsent(maskedTenantId, consentGranted) {
  await fetch(`${BASE_URL}/api/v1/governance/consent`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId: maskedTenantId, consentGranted }),
  });
}
