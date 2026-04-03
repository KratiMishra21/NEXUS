/**
 * @file api.js
 * @description Backend communication service for InsightOS Ghost SDK.
 * Handles event emission to Person B's edge/stream processing layer.
 *
 * Person A — Layer 1 / Services
 */

const BASE_URL = import.meta.env.VITE_INSIGHTOS_API_URL || "http://localhost:8000";

/**
 * Emits a batch of masked, taxonomy-compliant events to the backend.
 * The backend (Person B) routes these to Kafka (Cloud) or Insight Vault (On-Prem).
 *
 * @param {object[]} events - Array of masked event objects from ghost-sdk.js
 * @returns {Promise<void>}
 */
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

/**
 * Fetches dashboard analytics for Layer 5 UI components.
 * Called by the Dashboard.jsx and individual panel components.
 *
 * @param {object} params
 * @param {string} params.maskedTenantId - Masked tenant ID for isolation
 * @param {string} [params.dateFrom]     - ISO date string
 * @param {string} [params.dateTo]       - ISO date string
 * @returns {Promise<object>} Analytics payload from ClickHouse via backend
 */
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

/**
 * Fetches feature adoption heatmap data.
 * @param {string} maskedTenantId
 * @returns {Promise<object[]>} Array of { featureModule, adoptionRate, usageCount }
 */
export async function fetchAdoptionHeatmap(maskedTenantId) {
  const response = await fetch(
    `${BASE_URL}/api/v1/analytics/adoption?tenantId=${maskedTenantId}`
  );
  if (!response.ok) throw new Error("[InsightOS API] Heatmap fetch failed");
  return response.json();
}

/**
 * Fetches journey funnel data for drop-off analysis.
 * @param {string} journeyName - One of JOURNEY values
 * @param {string} maskedTenantId
 * @returns {Promise<object[]>} Array of { step, entryCount, dropCount, completionRate }
 */
export async function fetchJourneyFunnel(journeyName, maskedTenantId) {
  const response = await fetch(
    `${BASE_URL}/api/v1/analytics/journey-funnel?journey=${journeyName}&tenantId=${maskedTenantId}`
  );
  if (!response.ok) throw new Error("[InsightOS API] Journey funnel fetch failed");
  return response.json();
}

/**
 * Updates telemetry consent for a tenant via the Governance Panel.
 * @param {string} maskedTenantId
 * @param {boolean} consentGranted
 * @returns {Promise<void>}
 */
export async function updateTelemetryConsent(maskedTenantId, consentGranted) {
  await fetch(`${BASE_URL}/api/v1/governance/consent`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId: maskedTenantId, consentGranted }),
  });
}
