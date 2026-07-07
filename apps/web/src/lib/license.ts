import { randomBytes } from "crypto";

// Characters that won't be confused (no 0, O, 1, I, l)
const LICENSE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generate a license key in the format: DPRO-XXXX-XXXX-XXXX-XXXX
 */
export function generateLicenseKey(prefix: string = "DPRO"): string {
  const segments: string[] = [];

  for (let i = 0; i < 4; i++) {
    let segment = "";
    for (let j = 0; j < 4; j++) {
      const randomIndex = randomBytes(1)[0] % LICENSE_CHARS.length;
      segment += LICENSE_CHARS[randomIndex];
    }
    segments.push(segment);
  }

  return `${prefix}-${segments.join("-")}`;
}

/**
 * Validate license key format
 */
export function isValidLicenseKeyFormat(key: string): boolean {
  // Format: PREFIX-XXXX-XXXX-XXXX-XXXX
  const pattern =
    /^[A-Z]{4,5}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
  return pattern.test(key);
}

/**
 * Get plan from license key prefix
 */
export function getPlanFromKey(
  key: string,
): "pro" | "team" | "enterprise" | null {
  if (key.startsWith("DPRO-")) return "pro";
  if (key.startsWith("DTEAM-")) return "team";
  if (key.startsWith("DENT-")) return "enterprise";
  return null;
}

/**
 * Calculate updates expiration date (1 year from purchase)
 */
export function calculateUpdatesUntil(purchaseDate: Date = new Date()): Date {
  const expiry = new Date(purchaseDate);
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry;
}
