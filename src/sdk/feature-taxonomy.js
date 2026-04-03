/**
 * @file feature-taxonomy.js
 * @description Standardized Feature Tagging Taxonomy for InsightOS Ghost SDK.
 * Defines all event types, channels, feature modules, and journey steps.
 * Every event emitted by the SDK must conform to these enums.
 *
 * Person A — Layer 1: Ghost Instrumentation Layer
 */

// ─── Event Types ────────────────────────────────────────────────────────────

/**
 * @enum {string} EVENT_TYPE
 * Semantic tags auto-applied to every captured event.
 */
export const EVENT_TYPE = {
  FEATURE_OPEN: "FEATURE_OPEN",       // User navigated to / opened a feature
  FEATURE_SUCCESS: "FEATURE_SUCCESS", // Feature completed its intended action
  FEATURE_FAIL: "FEATURE_FAIL",       // Feature threw an error or was abandoned
  JOURNEY_START: "JOURNEY_START",     // User began a multi-step journey
  JOURNEY_STEP: "JOURNEY_STEP",       // User completed one step within a journey
  JOURNEY_DROP: "JOURNEY_DROP",       // User abandoned a journey mid-way
  JOURNEY_COMPLETE: "JOURNEY_COMPLETE", // User completed the full journey
  API_CALL: "API_CALL",               // Programmatic API invocation (batch/integration)
  BATCH_TRIGGER: "BATCH_TRIGGER",     // Scheduled/batch channel event
};

// ─── Channels ────────────────────────────────────────────────────────────────

/**
 * @enum {string} CHANNEL
 * Which interface surface triggered the event.
 */
export const CHANNEL = {
  WEB: "WEB",
  MOBILE: "MOBILE",
  API: "API",
  BATCH: "BATCH",
};

// ─── Feature Modules ─────────────────────────────────────────────────────────

/**
 * @enum {string} FEATURE_MODULE
 * Top-level licensed modules on the lending platform.
 * Used to detect "Zombie Features" — licensed but never invoked.
 */
export const FEATURE_MODULE = {
  LOAN_ORIGINATION: "LOAN_ORIGINATION",
  DOCUMENT_MANAGEMENT: "DOCUMENT_MANAGEMENT",
  RISK_ASSESSMENT: "RISK_ASSESSMENT",
  COMPLIANCE_CHECK: "COMPLIANCE_CHECK",
  REPAYMENT_SCHEDULE: "REPAYMENT_SCHEDULE",
  UPSELL_ENGINE: "UPSELL_ENGINE",
  REPORTING_DASHBOARD: "REPORTING_DASHBOARD",
  TENANT_MANAGEMENT: "TENANT_MANAGEMENT",
};

// ─── Journey Definitions ──────────────────────────────────────────────────────

/**
 * @enum {string} JOURNEY
 * Named multi-step user workflows tracked end-to-end.
 */
export const JOURNEY = {
  LOAN_APPLICATION: "LOAN_APPLICATION",
  KYC_VERIFICATION: "KYC_VERIFICATION",
  DOCUMENT_UPLOAD: "DOCUMENT_UPLOAD",
  LOAN_APPROVAL: "LOAN_APPROVAL",
  DISBURSEMENT: "DISBURSEMENT",
};

/**
 * @type {Object.<string, string[]>}
 * Ordered steps for each journey. Used by the Journey Correlation Engine (Person C).
 */
export const JOURNEY_STEPS = {
  [JOURNEY.LOAN_APPLICATION]: [
    "PERSONAL_DETAILS",
    "INCOME_DETAILS",
    "EMPLOYMENT_DETAILS",
    "DOCUMENT_UPLOAD",
    "REVIEW_SUBMIT",
  ],
  [JOURNEY.KYC_VERIFICATION]: [
    "ID_UPLOAD",
    "FACE_MATCH",
    "ADDRESS_PROOF",
    "VERIFICATION_COMPLETE",
  ],
  [JOURNEY.DOCUMENT_UPLOAD]: [
    "SELECT_DOCUMENT_TYPE",
    "UPLOAD_FILE",
    "OCR_PROCESSING",
    "DOCUMENT_CONFIRMED",
  ],
};

// ─── Standardized Event Schema ────────────────────────────────────────────────

/**
 * Creates a fully-typed, taxonomy-compliant event object.
 * Ghost SDK calls this before buffering any event.
 *
 * @param {object} params
 * @param {string} params.eventType       - One of EVENT_TYPE values
 * @param {string} params.featureModule   - One of FEATURE_MODULE values
 * @param {string} params.channel         - One of CHANNEL values
 * @param {string} params.tenantId        - Masked tenant identifier
 * @param {string} [params.journeyId]     - Active journey ID (if in a journey)
 * @param {string} [params.journeyStep]   - Current step name within the journey
 * @param {object} [params.metadata]      - Additional non-PII context
 * @returns {object} Structured, taxonomy-compliant event payload
 */
export function createEvent({
  eventType,
  featureModule,
  channel,
  tenantId,
  journeyId = null,
  journeyStep = null,
  metadata = {},
}) {
  if (!Object.values(EVENT_TYPE).includes(eventType)) {
    console.warn(`[InsightOS] Unknown eventType: ${eventType}`);
  }
  if (!Object.values(FEATURE_MODULE).includes(featureModule)) {
    console.warn(`[InsightOS] Unknown featureModule: ${featureModule}`);
  }

  return {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    eventType,
    featureModule,
    channel,
    tenantId,        // Already masked by masking.js before this is called
    journeyId,
    journeyStep,
    sdkVersion: "1.0.0",
    metadata,
  };
}