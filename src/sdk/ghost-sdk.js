

import { createEvent, EVENT_TYPE, CHANNEL } from "./feature-taxonomy.js";
import { maskEventPII, maskTenantId } from "./masking.js";
import { emitEvents } from "../services/api.js";


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


export const trackSuccess = (featureModule, metadata) =>
  capture({ eventType: EVENT_TYPE.FEATURE_SUCCESS, featureModule, metadata });


export const trackFailure = (featureModule, metadata) =>
  capture({ eventType: EVENT_TYPE.FEATURE_FAIL, featureModule, metadata });


export const trackOpen = (featureModule, metadata) =>
  capture({ eventType: EVENT_TYPE.FEATURE_OPEN, featureModule, metadata });


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


export function setConsent(granted) {
  if (!_config) return;
  _config.consentGranted = granted;
  if (!granted) {
    // Immediately purge buffer on consent revocation
    _eventBuffer = [];
    if (_config.debug) console.info("[GhostSDK] Consent revoked — buffer cleared");
  }
}


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


export async function destroy() {
  if (_flushTimer) clearInterval(_flushTimer);
  await _flushBuffer(true);
  _config = null;
  _eventBuffer = [];
  _activeJourneys = {};
}



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
