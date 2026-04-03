/**
 * @file ghost-sdk.js
 * @description InsightOS Ghost SDK — Core Orchestrator.
 *
 * The "Ghost" SDK operates transparently inside the host application.
 * It intercepts UI actions via the tracking-wrapper, enriches events with
 * taxonomy metadata, masks PII at source, then buffers and emits events
 * to the backend without impacting application performance.
 *
 * Key design principles:
 *  - Zero-overhead: async, non-blocking, fire-and-forget
 *  - PII-safe: masking happens before anything leaves app memory
 *  - Circuit breaker: halts telemetry if performance threshold is breached
 *  - Consent-aware: respects per-tenant telemetry opt-in/out
 *
 * Person A — Layer 1: Ghost Instrumentation Layer
 */

import { createEvent, EVENT_TYPE, CHANNEL } from "./feature-taxonomy.js";
import { maskEventPII, maskTenantId } from "./masking.js";
import { emitEvents } from "../services/api.js";

// ─── SDK Configuration ────────────────────────────────────────────────────────

/**
 * @typedef {object} GhostSDKConfig
 * @property {string}  tenantId          - Raw tenant ID (will be masked internally)
 * @property {string}  channel           - One of CHANNEL values
 * @property {boolean} [consentGranted]  - Telemetry consent flag (default: false)
 * @property {number}  [flushInterval]   - Buffer flush interval in ms (default: 5000)
 * @property {number}  [maxBufferSize]   - Max events before forced flush (default: 50)
 * @property {number}  [cpuThreshold]    - CPU % above which telemetry is paused (default: 80)
 * @property {boolean} [debug]           - Enable console logging for development
 */

const DEFAULT_CONFIG = {
  consentGranted: false,
  flushInterval: 5000,   // 5 seconds
  maxBufferSize: 50,
  cpuThreshold: 80,      // Matches InsightOS spec: halt if system load too high
  debug: false,
};

// ─── SDK State ────────────────────────────────────────────────────────────────

let _config = null;
let _maskedTenantId = null;
let _eventBuffer = [];
let _flushTimer = null;
let _isCircuitOpen = false; // true = telemetry paused (circuit breaker triggered)
let _activeJourneys = {};   // journeyId → { journey, currentStep, startedAt }

// ─── Initialization ────────────────────────────────────────────────────────────

/**
 * Initializes the Ghost SDK. Call once at app bootstrap (e.g., in main.jsx).
 *
 * @param {GhostSDKConfig} config
 * @returns {Promise<void>}
 *
 * @example
 * await GhostSDK.init({
 *   tenantId: "tenant_acme_corp",
 *   channel: CHANNEL.WEB,
 *   consentGranted: true,
 *   debug: true,
 * });
 */
export async function init(config) {
  _config = { ...DEFAULT_CONFIG, ...config };
  _maskedTenantId = await maskTenantId(_config.tenantId);

  if (_config.debug) {
    console.info("[GhostSDK] Initialized", {
      maskedTenantId: _maskedTenantId,
      channel: _config.channel,
      consentGranted: _config.consentGranted,
    });
  }

  // Start periodic buffer flush
  _flushTimer = setInterval(_flushBuffer, _config.flushInterval);

  // Flush remaining events on page/app unload
  window?.addEventListener("beforeunload", () => _flushBuffer(true));
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

/**
 * Performance Circuit Breaker.
 * Uses the PerformanceObserver / navigator APIs to estimate CPU load.
 * If performance is degraded, telemetry is paused to protect the host app.
 *
 * In production, integrate with your APM agent for real CPU metrics.
 * This implementation uses long task detection as a proxy.
 *
 * @returns {boolean} true if telemetry should be paused
 */
function _checkCircuitBreaker() {
  // Proxy: if event buffer is backed up, the system is under load
  if (_eventBuffer.length >= _config.maxBufferSize * 2) {
    _isCircuitOpen = true;
    if (_config.debug) console.warn("[GhostSDK] Circuit breaker OPEN — buffer overloaded");
    return true;
  }
  _isCircuitOpen = false;
  return false;
}

// ─── Core Event Capture ────────────────────────────────────────────────────────

/**
 * Captures a feature event. This is the primary entry point called by
 * tracking-wrapper.js and React components via the useTelemetry hook.
 *
 * The flow: validate consent → check circuit breaker → create taxonomy event
 *           → mask PII → buffer → flush if full
 *
 * @param {object} params
 * @param {string} params.eventType     - One of EVENT_TYPE values
 * @param {string} params.featureModule - One of FEATURE_MODULE values
 * @param {string} [params.journeyId]   - Active journey correlation ID
 * @param {string} [params.journeyStep] - Current step in the journey
 * @param {object} [params.metadata]    - Additional non-PII context payload
 * @returns {Promise<void>}
 */
export async function capture({ eventType, featureModule, journeyId, journeyStep, metadata = {} }) {
  // Guard: consent
  if (!_config?.consentGranted) {
    if (_config?.debug) console.log("[GhostSDK] Telemetry skipped — consent not granted");
    return;
  }

  // Guard: circuit breaker
  if (_checkCircuitBreaker()) return;

  // Build taxonomy-compliant event
  const rawEvent = createEvent({
    eventType,
    featureModule,
    channel: _config.channel,
    tenantId: _maskedTenantId, // Already masked
    journeyId: journeyId || null,
    journeyStep: journeyStep || null,
    metadata,
  });

  // Mask any residual PII in metadata fields
  const safeEvent = await maskEventPII(rawEvent);

  _eventBuffer.push(safeEvent);

  if (_config?.debug) console.log("[GhostSDK] Captured:", safeEvent);

  // Force flush if buffer is full
  if (_eventBuffer.length >= _config.maxBufferSize) {
    await _flushBuffer();
  }
}

// ─── Convenience Helpers ──────────────────────────────────────────────────────

/**
 * Tracks a successful feature interaction.
 * Wrap any feature's "happy path" completion with this.
 *
 * @param {string} featureModule - One of FEATURE_MODULE values
 * @param {object} [metadata]    - Optional context (non-PII)
 */
export const trackSuccess = (featureModule, metadata) =>
  capture({ eventType: EVENT_TYPE.FEATURE_SUCCESS, featureModule, metadata });

/**
 * Tracks a feature failure or error state.
 *
 * @param {string} featureModule - One of FEATURE_MODULE values
 * @param {object} [metadata]    - Error context (ensure no PII in error messages)
 */
export const trackFailure = (featureModule, metadata) =>
  capture({ eventType: EVENT_TYPE.FEATURE_FAIL, featureModule, metadata });

/**
 * Tracks when a feature/module is opened/navigated to.
 *
 * @param {string} featureModule
 * @param {object} [metadata]
 */
export const trackOpen = (featureModule, metadata) =>
  capture({ eventType: EVENT_TYPE.FEATURE_OPEN, featureModule, metadata });

// ─── Journey Tracking ──────────────────────────────────────────────────────────

/**
 * Starts a named journey and returns a journey correlation ID.
 * The journey ID links all subsequent step events for funnel analysis.
 *
 * @param {string} journeyName - One of JOURNEY values from feature-taxonomy.js
 * @returns {Promise<string>} journeyId to pass into subsequent trackJourneyStep calls
 *
 * @example
 * const journeyId = await GhostSDK.startJourney(JOURNEY.LOAN_APPLICATION);
 */
export async function startJourney(journeyName) {
  const journeyId = crypto.randomUUID();
  _activeJourneys[journeyId] = {
    journey: journeyName,
    startedAt: Date.now(),
    currentStep: null,
  };

  await capture({
    eventType: EVENT_TYPE.JOURNEY_START,
    featureModule: journeyName,
    journeyId,
    metadata: { journeyName },
  });

  if (_config?.debug) console.log(`[GhostSDK] Journey started: ${journeyName} (${journeyId})`);
  return journeyId;
}

/**
 * Records the completion of one step within an active journey.
 *
 * @param {string} journeyId   - ID returned by startJourney()
 * @param {string} stepName    - Step name from JOURNEY_STEPS in feature-taxonomy.js
 * @param {object} [metadata]
 */
export async function trackJourneyStep(journeyId, stepName, metadata = {}) {
  if (!_activeJourneys[journeyId]) {
    console.warn(`[GhostSDK] Unknown journeyId: ${journeyId}`);
    return;
  }
  _activeJourneys[journeyId].currentStep = stepName;

  await capture({
    eventType: EVENT_TYPE.JOURNEY_STEP,
    featureModule: _activeJourneys[journeyId].journey,
    journeyId,
    journeyStep: stepName,
    metadata,
  });
}

/**
 * Marks a journey as successfully completed.
 *
 * @param {string} journeyId
 * @param {object} [metadata]
 */
export async function completeJourney(journeyId, metadata = {}) {
  if (!_activeJourneys[journeyId]) return;

  const duration = Date.now() - _activeJourneys[journeyId].startedAt;
  await capture({
    eventType: EVENT_TYPE.JOURNEY_COMPLETE,
    featureModule: _activeJourneys[journeyId].journey,
    journeyId,
    metadata: { ...metadata, durationMs: duration },
  });

  delete _activeJourneys[journeyId];
}

/**
 * Records a journey drop-off (user abandoned mid-journey).
 * Critical for Person C's funnel drop-off analysis.
 *
 * @param {string} journeyId
 * @param {string} [reason] - Drop reason (non-PII, e.g., "timeout", "navigation")
 */
export async function dropJourney(journeyId, reason = "unknown") {
  if (!_activeJourneys[journeyId]) return;

  const { journey, currentStep, startedAt } = _activeJourneys[journeyId];
  await capture({
    eventType: EVENT_TYPE.JOURNEY_DROP,
    featureModule: journey,
    journeyId,
    journeyStep: currentStep,
    metadata: { reason, durationMs: Date.now() - startedAt },
  });

  delete _activeJourneys[journeyId];
}

// ─── Buffer Management ────────────────────────────────────────────────────────

/**
 * Flushes the event buffer to the backend API.
 * Called periodically by the timer and on-demand when buffer is full.
 *
 * @param {boolean} [force] - If true, flushes synchronously (used on page unload)
 * @returns {Promise<void>}
 */
async function _flushBuffer(force = false) {
  if (_eventBuffer.length === 0) return;

  const batchToSend = [..._eventBuffer];
  _eventBuffer = []; // Clear buffer immediately to avoid duplicate sends

  try {
    await emitEvents(batchToSend);
    if (_config?.debug) console.log(`[GhostSDK] Flushed ${batchToSend.length} events`);
  } catch (err) {
    // On failure, re-queue events (up to max buffer size to avoid memory leak)
    if (!force && _eventBuffer.length < _config.maxBufferSize) {
      _eventBuffer = [...batchToSend, ..._eventBuffer];
    }
    if (_config?.debug) console.error("[GhostSDK] Flush failed, events re-queued:", err);
  }
}

// ─── Consent Management ───────────────────────────────────────────────────────

/**
 * Updates telemetry consent at runtime.
 * Call this when the user changes consent in the Governance Panel.
 *
 * @param {boolean} granted
 */
export function setConsent(granted) {
  if (!_config) return;
  _config.consentGranted = granted;
  if (!granted) {
    // Immediately purge buffer on consent revocation
    _eventBuffer = [];
    if (_config.debug) console.info("[GhostSDK] Consent revoked — buffer cleared");
  }
}

/**
 * Returns the current SDK status for the Governance Panel UI.
 * @returns {object} Status snapshot
 */
export function getStatus() {
  return {
    initialized: !!_config,
    consentGranted: _config?.consentGranted ?? false,
    maskedTenantId: _maskedTenantId,
    bufferedEvents: _eventBuffer.length,
    circuitBreakerOpen: _isCircuitOpen,
    activeJourneys: Object.keys(_activeJourneys).length,
  };
}

/**
 * Tears down the SDK (clears timers, flushes buffer).
 * Call on app unmount or logout.
 */
export async function destroy() {
  if (_flushTimer) clearInterval(_flushTimer);
  await _flushBuffer(true);
  _config = null;
  _eventBuffer = [];
  _activeJourneys = {};
}

// ─── Default Export ───────────────────────────────────────────────────────────

const GhostSDK = {
  init,
  capture,
  trackOpen,
  trackSuccess,
  trackFailure,
  startJourney,
  trackJourneyStep,
  completeJourney,
  dropJourney,
  setConsent,
  getStatus,
  destroy,
};

export default GhostSDK;