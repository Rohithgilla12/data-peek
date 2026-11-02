// Kept free of imports so the dashboard's client bundle can share it with the
// API routes; lib/license.ts pulls in node's crypto.
export function normalizeLicenseKey(raw: string): string {
  return raw.trim().toUpperCase();
}
