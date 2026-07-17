# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via
[GitHub private vulnerability reporting](https://github.com/Rohithgilla12/data-peek/security/advisories/new).
If you can't use GitHub, email gillarohith1@gmail.com with "security" in the
subject. Do not open public issues for security problems.

We aim to acknowledge reports within 7 days. data-peek is a
single-maintainer project; this is a good-faith goal, not a contractual SLA.

## Supported versions

Security fixes target the latest release only. If you are on an older
version, update first and re-test.

## Scope notes

- data-peek connects directly from your machine to your databases; there is no
  intermediary service and nothing is phoned home. Query timing statistics are
  collected locally for the performance panel and never leave your machine.
- Credentials are encrypted with a key protected by the OS keychain (Electron
  `safeStorage`) on platforms that provide one; on systems without OS-backed
  secure storage the app degrades to plaintext storage with a logged warning.
- The optional local MCP server binds to 127.0.0.1 only and requires a bearer
  token; write statements additionally require in-app approval.
