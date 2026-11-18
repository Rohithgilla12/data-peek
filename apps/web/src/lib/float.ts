export const FLOAT_URL = "https://float.gilla.fun";

// Float's site runs Umami, which reports utm_* params; the referrer alone is
// lost because outbound links here use rel="noreferrer".
export function floatHref(placement: string): string {
  const params = new URLSearchParams({
    utm_source: "datapeek",
    utm_medium: placement,
  });
  return `${FLOAT_URL}/?${params}`;
}
