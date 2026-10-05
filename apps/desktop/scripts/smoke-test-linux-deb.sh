#!/usr/bin/env bash
# Install a built .deb on Ubuntu and prove it launches with Ubuntu's defaults.
#
# Usage: smoke-test-linux-deb.sh <path/to/data-peek-*.deb>
#
# Ubuntu 24.04+ blocks unprivileged user namespaces through AppArmor unless the
# binary has a profile allowing them. Without one, Electron's sandbox can't
# start and the app aborts on launch (issue #297). The e2e suite never caught
# this because it runs Electron from node_modules, never the installed package.
# So this script installs the real package, makes sure the restriction is on,
# and launches the installed binary as a normal user.
#
# Needs sudo, AppArmor, and xvfb-run (Ubuntu runners have all three).
set -euo pipefail

deb="${1:?usage: smoke-test-linux-deb.sh <path/to/data-peek-*.deb>}"
install_dir=/opt/data-peek
binary="$install_dir/data-peek"
launch_seconds=25

fail() {
  echo "::error::$*" >&2
  exit 1
}

echo "Checking package contents of $deb"
contents="$(dpkg-deb -c "$deb" | awk '{ $1 = $2 = $3 = $4 = $5 = ""; sub(/^ +/, ""); print }')"
grep -qx "./opt/data-peek/data-peek" <<<"$contents" ||
  fail "the binary is not at $binary; was the Linux build run with -c.productName=data-peek?"
# A space anywhere in the install path breaks the SUID sandbox fallback.
if grep -E '^\./opt/[^/]* ' <<<"$contents" >/dev/null; then
  fail "the install path under /opt contains a space"
fi
grep -qx "./opt/data-peek/resources/apparmor-profile" <<<"$contents" ||
  fail "the .deb ships no AppArmor profile; electron-builder 26+ adds one"

package="$(dpkg-deb -f "$deb" Package)"
echo "Installing $package"
sudo apt-get install -y --no-install-recommends "$(realpath "$deb")"

[ -f "/etc/apparmor.d/$package" ] || fail "postinst did not install /etc/apparmor.d/$package"
sudo aa-enabled --quiet || fail "AppArmor is not enabled here, so this test would prove nothing"
sudo aa-status | grep -qF "$package" || fail "the $package AppArmor profile is not loaded"

knob=/proc/sys/kernel/apparmor_restrict_unprivileged_userns
[ -f "$knob" ] || fail "this kernel has no $knob, so the Ubuntu 24.04+ restriction can't be tested"
previous="$(cat "$knob")"
echo "Turning the user-namespace restriction on (was $previous)"
sudo sysctl -q -w kernel.apparmor_restrict_unprivileged_userns=1
trap 'sudo sysctl -q -w kernel.apparmor_restrict_unprivileged_userns="$previous"' EXIT

log="$(mktemp)"
profile_dir="$(mktemp -d)"
echo "Launching $binary as $(id -un) for ${launch_seconds}s"
set +e
DP_E2E=1 timeout "$launch_seconds" xvfb-run --auto-servernum \
  "$binary" --user-data-dir="$profile_dir" >"$log" 2>&1
status=$?
set -e

# A healthy app is still running when timeout stops it (exit 124). Anything
# else means it exited or crashed on its own. Only sandbox failures count:
# Electron also logs a FATAL "Failed to shutdown" when timeout kills it.
if grep -qE 'SUID sandbox helper|setuid_sandbox_host|No usable sandbox|zygote_host' "$log" || [ "$status" -ne 124 ]; then
  echo "--- app output (exit $status) ---"
  cat "$log"
  fail "the installed app did not stay up under the user-namespace restriction"
fi
echo "App stayed up for ${launch_seconds}s with the sandbox enabled"

echo "Removing $package"
sudo apt-get remove -y "$package"
[ ! -e "/etc/apparmor.d/$package" ] || fail "postrm left /etc/apparmor.d/$package behind"

echo "Linux .deb smoke test passed"
