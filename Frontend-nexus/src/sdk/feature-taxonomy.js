
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


export const CHANNEL = {
  WEB: "WEB",
  MOBILE: "MOBILE",
  API: "API",
  BATCH: "BATCH",
};


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


export const JOURNEY = {
  LOAN_APPLICATION: "LOAN_APPLICATION",
  KYC_VERIFICATION: "KYC_VERIFICATION",
  DOCUMENT_UPLOAD: "DOCUMENT_UPLOAD",
  LOAN_APPROVAL: "LOAN_APPROVAL",
  DISBURSEMENT: "DISBURSEMENT",
};


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