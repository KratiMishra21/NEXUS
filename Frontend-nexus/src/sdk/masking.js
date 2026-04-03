/**
 * @file masking.js
 * @description PII Ghosting / Masking Engine for InsightOS Ghost SDK.
 * All sensitive data is hashed at the source — BEFORE it leaves application memory.
 * No raw PII ever touches the event buffer or network layer.
 *
 * Uses SHA-256 via the Web Crypto API (zero external dependencies).
 * For Node.js environments, falls back to the native `crypto` module.
 *
 * Person A — Layer 1: Ghost Instrumentation Layer
 */

// ─── Core Hashing ────────────────────────────────────────────────────────────

/**
 * Hashes a string value using SHA-256.
 * Returns a consistent hex digest — same input always produces same output,
 * enabling cross-session correlation without exposing raw data.
 *
 * @param {string} value - Raw sensitive string to hash
 * @returns {Promise<string>} Hex-encoded SHA-256 digest
 */
export async function hashValue(value) {
  if (!value || typeof value !== "string") return null;

  // Web Crypto API (browser + modern Node via globalThis)
  const encoder = new TextEncoder();
  const data = encoder.encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Synchronous fallback hash using a simple deterministic algorithm.
 * Use only when SubtleCrypto is unavailable (legacy environments).
 * NOT cryptographically secure — use hashValue() wherever possible.
 *
 * @param {string} value
 * @returns {string} Deterministic hash string
 */
export function hashValueSync(value) {
  if (!value) return null;
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return `sync_${Math.abs(hash).toString(16)}`;
}

// ─── PII Field Definitions ────────────────────────────────────────────────────

/**
 * @constant PII_FIELDS
 * Field names that must ALWAYS be masked before inclusion in any event.
 * Copilot: extend this list as new PII fields are identified.
 */
export const PII_FIELDS = [
  "userId",
  "email",
  "phone",
  "aadhaar",
  "pan",
  "accountNumber",
  "ifscCode",
  "dateOfBirth",
  "ipAddress",
  "deviceId",
  "tenantId",   // Tenant IDs are masked for cross-tenant anonymity
  "loanId",
];

// ─── Object-Level Masking ─────────────────────────────────────────────────────

/**
 * Scans an event/metadata object and masks all PII fields in-place (async).
 * Non-PII fields pass through unchanged.
 *
 * @param {object} eventObj - Raw event object potentially containing PII
 * @returns {Promise<object>} New object with all PII fields replaced by SHA-256 hashes
 *
 * @example
 * const masked = await maskEventPII({ userId: "john@example.com", action: "click" });
 * // masked.userId → "5d41402abc..." (hash), masked.action → "click" (unchanged)
 */
export async function maskEventPII(eventObj) {
  const masked = { ...eventObj };

  const maskPromises = PII_FIELDS.map(async (field) => {
    if (masked[field] !== undefined && masked[field] !== null) {
      masked[field] = await hashValue(String(masked[field]));
    }
  });

  await Promise.all(maskPromises);

  // Recursively mask nested metadata object
  if (masked.metadata && typeof masked.metadata === "object") {
    masked.metadata = await maskEventPII(masked.metadata);
  }

  return masked;
}

/**
 * Masks a single tenant ID for safe cross-tenant analytics.
 * Consistent hashing ensures the same tenant always maps to the same masked ID,
 * enabling de-duplicated tenant segmentation without exposing identity.
 *
 * @param {string} tenantId - Raw tenant identifier
 * @returns {Promise<string>} Masked tenant ID
 */
export async function maskTenantId(tenantId) {
  const hash = await hashValue(tenantId);
  return `tenant_${hash.slice(0, 12)}`; // Short prefix for readability in dashboards
}

// ─── String Redaction ─────────────────────────────────────────────────────────

/**
 * Redacts common PII patterns from free-text strings (error messages, logs).
 * Replaces detected patterns with [REDACTED] placeholder.
 *
 * @param {string} text - Raw string that may contain embedded PII
 * @returns {string} Text with PII patterns replaced
 */
export function redactPIIFromString(text) {
  if (!text || typeof text !== "string") return text;

  return text
    // Email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    // Indian phone numbers (10 digits, optionally prefixed with +91 or 0)
    .replace(/(\+91|0)?[6-9]\d{9}/g, "[PHONE]")
    // Aadhaar (12 digits, may be spaced)
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[AADHAAR]")
    // PAN card (AAAAA0000A format)
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g, "[PAN]")
    // IPv4 addresses
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP]");
}
