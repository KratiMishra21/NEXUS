
export async function hashValue(value) {
  if (!value || typeof value !== "string") return null;

  // Web Crypto API (browser + modern Node via globalThis)
  const encoder = new TextEncoder();
  const data = encoder.encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}


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


export async function maskTenantId(tenantId) {
  const hash = await hashValue(tenantId);
  return `tenant_${hash.slice(0, 12)}`; // Short prefix for readability in dashboards
}


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
