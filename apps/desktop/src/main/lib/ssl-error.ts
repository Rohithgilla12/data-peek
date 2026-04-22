/**
 * Translate known TLS/SSL error codes into actionable messages that point
 * the user at the "Verify server certificate" checkbox in the connection
 * dialog. pg/mysql2 surface the underlying Node TLS error codes verbatim.
 */
const SSL_ERROR_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID'
])

export function annotateSslError(err: unknown): Error {
  if (!(err instanceof Error)) return new Error(String(err))

  const code = (err as NodeJS.ErrnoException).code
  const message = err.message || ''

  const looksLikeSsl =
    (code && SSL_ERROR_CODES.has(code)) ||
    /self[- ]signed certificate/i.test(message) ||
    /unable to verify the first certificate/i.test(message) ||
    /certificate has expired/i.test(message)

  if (!looksLikeSsl) return err

  const hint =
    'The server uses a self-signed or private-CA certificate. ' +
    'Uncheck "Verify server certificate (strict)" in the connection dialog, ' +
    'or provide the CA certificate path. This is common for AWS RDS, Supabase, ' +
    'Neon, and DigitalOcean Managed Databases.'

  return new Error(`${message}\n\n${hint}`)
}
