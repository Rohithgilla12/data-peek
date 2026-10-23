# ClickHouse seed stacks

`compose.yml` is the default local stack used by `smoke:clickhouse`.

`compose.ssh-tls.yml` (used by `smoke:clickhouse:ssh-tls`) adds:

- `clickhouse-tls`: ClickHouse 24.8 with HTTPS on 8443, terminated with a
  self-signed certificate from `tls/`, plus plain HTTP on 8123 inside the
  compose network for the SSH-tunnel cases.
- `ssh-bastion`: a linuxserver/openssh-server container with a single
  public-key-only `tunnel` user, used to exercise SSH tunnels.

## Test-only material

Everything under `tls/` and `ssh/` was generated only for these tests and is
safe to commit. Never point a real connection at it.

- `tls/ca.crt`: self-signed test CA (`openssl req -x509 -newkey rsa:3072 -days 3650 -subj /CN=data-peek-test-ca`).
- `tls/server.crt` / `tls/server.key`: server certificate signed by that CA,
  SANs `localhost`, `clickhouse-tls`, `127.0.0.1`. The CA private key is not
  committed; regenerate both certificates if they ever expire.
- `ssh/id_rsa` / `ssh/id_rsa.pub`: throwaway 3072-bit keypair
  (`ssh-keygen -t rsa -b 3072 -N ''`) for the bastion's `tunnel` user.
