/**
 * Redaction policy shared by the main and renderer loggers so both sides scrub the
 * same secrets. Keys are matched case-insensitively by substring, so `apiKey`,
 * `API_KEY`, and `sshConfig.privateKeyPath` are all caught.
 */
const SENSITIVE_KEYS = [
  "password",
  "passphrase",
  "license_key",
  "licensekey",
  "api_key",
  "apikey",
  "secret",
  "token",
  "authorization",
  "privatekey",
  "sslkey",
  "sslcert",
  "connectionstring",
  "credential",
];

/**
 * Return a deep copy of `obj` with the values of any sensitive-looking keys replaced
 * by a redaction marker. Non-objects are returned unchanged. Safe to call on
 * connection configs, AI configs, or anything else before logging.
 */
export function redactSensitive(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(redactSensitive);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk))) {
      result[key] = "***REDACTED***";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactSensitive(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
