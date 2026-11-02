"use client";

import {
  useEffect,
  useReducer,
  useState,
  type Dispatch,
  type FormEvent,
} from "react";
import { normalizeLicenseKey } from "@/lib/license-key";
import type { LicenseDevice, LicenseOverview } from "@/lib/license-overview";

const STORAGE_KEY = "datapeek.dashboard.licenseKey";

type State =
  | { kind: "enter" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "loaded";
      license: LicenseOverview;
      removing: Set<string>;
      error: string | null;
    };

type Action =
  | { type: "submit" }
  | { type: "failed"; message: string }
  | { type: "loaded"; license: LicenseOverview }
  | { type: "remove-start"; instanceId: string }
  | { type: "remove-done"; instanceId: string; license: LicenseOverview }
  | { type: "remove-failed"; instanceId: string; message: string }
  | { type: "reset" };

function without(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  next.delete(value);
  return next;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "submit":
      return { kind: "loading" };
    case "failed":
      return { kind: "error", message: action.message };
    case "loaded":
      return {
        kind: "loaded",
        license: action.license,
        removing: new Set(),
        error: null,
      };
    case "reset":
      return { kind: "enter" };
  }

  if (state.kind !== "loaded") return state;

  switch (action.type) {
    case "remove-start":
      return {
        ...state,
        removing: new Set(state.removing).add(action.instanceId),
        error: null,
      };
    case "remove-done":
      return {
        ...state,
        license: action.license,
        removing: without(state.removing, action.instanceId),
      };
    case "remove-failed":
      return {
        ...state,
        removing: without(state.removing, action.instanceId),
        error: action.message,
      };
  }
}

type Fetched =
  { ok: true; license: LicenseOverview } | { ok: false; message: string };

async function fetchOverview(licenseKey: string): Promise<Fetched> {
  try {
    const res = await fetch("/api/license/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: licenseKey }),
    });
    const data = await res.json();
    if (res.ok && data.success) return { ok: true, license: data.license };
    return { ok: false, message: data.error ?? "Could not load this license." };
  } catch {
    return { ok: false, message: "Could not reach the license server." };
  }
}

async function deactivate(licenseKey: string, instanceId: string) {
  const res = await fetch("/api/license/deactivate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ license_key: licenseKey, instance_id: instanceId }),
  });
  if (!res.ok) throw new Error("deactivate failed");
}

function readStoredKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeKey(key: string | null) {
  try {
    if (key) sessionStorage.setItem(STORAGE_KEY, key);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function readInitialKey(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("key");
  const key = normalizeLicenseKey(fromUrl ?? readStoredKey() ?? "");
  return key || null;
}

// The key is a credential: keep it out of browser history and copied links.
function stripKeyFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("key")) return;
  url.searchParams.delete("key");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

function settle(dispatch: Dispatch<Action>, result: Fetched) {
  if (result.ok) {
    storeKey(result.license.licenseKey);
    dispatch({ type: "loaded", license: result.license });
  } else {
    storeKey(null);
    dispatch({ type: "failed", message: result.message });
  }
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

// Rendered client-only (see dashboard-client.tsx) so the initial state can
// come straight from the URL or sessionStorage without a hydration mismatch.
export function LicenseDashboard() {
  const [initialKey] = useState(readInitialKey);
  const [state, dispatch] = useReducer(
    reducer,
    initialKey ? { kind: "loading" } : { kind: "enter" },
  );
  const [keyInput, setKeyInput] = useState(initialKey ?? "");

  useEffect(() => {
    stripKeyFromUrl();
    if (!initialKey) return;
    let cancelled = false;
    void fetchOverview(initialKey).then((result) => {
      if (!cancelled) settle(dispatch, result);
    });
    return () => {
      cancelled = true;
    };
  }, [initialKey]);

  const load = async (raw: string) => {
    const licenseKey = normalizeLicenseKey(raw);
    if (!licenseKey) return;
    setKeyInput(licenseKey);
    dispatch({ type: "submit" });
    settle(dispatch, await fetchOverview(licenseKey));
  };

  const remove = async (licenseKey: string, instanceId: string) => {
    dispatch({ type: "remove-start", instanceId });
    try {
      await deactivate(licenseKey, instanceId);
    } catch {
      dispatch({
        type: "remove-failed",
        instanceId,
        message: "Could not remove that device. Try again.",
      });
      return;
    }
    const result = await fetchOverview(licenseKey);
    if (result.ok) {
      dispatch({ type: "remove-done", instanceId, license: result.license });
    } else {
      dispatch({ type: "remove-failed", instanceId, message: result.message });
    }
  };

  const forget = () => {
    storeKey(null);
    setKeyInput("");
    dispatch({ type: "reset" });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void load(keyInput);
  };

  if (state.kind === "loaded") {
    return (
      <Loaded
        license={state.license}
        removing={state.removing}
        error={state.error}
        onRemove={(instanceId) =>
          void remove(state.license.licenseKey, instanceId)
        }
        onForget={forget}
      />
    );
  }

  return (
    <KeyForm
      value={keyInput}
      onChange={setKeyInput}
      onSubmit={onSubmit}
      loading={state.kind === "loading"}
      error={state.kind === "error" ? state.message : null}
    />
  );
}

function KeyForm({
  value,
  onChange,
  onSubmit,
  loading,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <form onSubmit={onSubmit} className="max-w-[560px]">
      <label
        htmlFor="license-key"
        className="text-[11px] uppercase tracking-[0.16em] text-[var(--n-fg-faint)]"
      >
        License key
      </label>
      <div className="mt-2 flex flex-col sm:flex-row gap-2">
        <input
          id="license-key"
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          placeholder="DPRO-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="flex-1 h-11 px-3 bg-[var(--n-bg-sunken)] text-[14px] text-[var(--n-fg)] tracking-[0.04em] placeholder:text-[var(--n-fg-faint)] outline-none focus:border-[var(--n-accent)]"
          style={{ border: "1px solid var(--n-line)" }}
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="h-11 px-5 inline-flex items-center justify-center text-[13px] font-medium disabled:opacity-60"
          style={{
            background: "var(--n-accent)",
            color: "var(--n-accent-ink)",
          }}
        >
          {loading ? "Loading…" : "Show devices"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--color-error)]">
          {error}
        </p>
      )}
    </form>
  );
}

function Loaded({
  license,
  removing,
  error,
  onRemove,
  onForget,
}: {
  license: LicenseOverview;
  removing: Set<string>;
  error: string | null;
  onRemove: (instanceId: string) => void;
  onForget: () => void;
}) {
  const summary = [
    { label: "Plan", value: license.plan },
    {
      label: "Status",
      value: license.status,
      warn: license.status !== "active",
    },
    { label: "Updates until", value: day(license.updatesUntil) },
    {
      label: "Devices",
      value: `${license.devices.length} of ${license.maxActivations} used`,
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-[14px] tracking-[0.04em] text-[var(--n-fg)]">
          {license.licenseKey}
        </div>
        <button
          type="button"
          onClick={onForget}
          className="text-[12px] text-[var(--n-fg-muted)] underline underline-offset-4 decoration-[var(--n-line)] hover:text-[var(--n-fg)]"
        >
          Use a different key
        </button>
      </div>

      <dl
        className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--n-line-soft)]"
        style={{ border: "1px solid var(--n-line)" }}
      >
        {summary.map(({ label, value, warn }) => (
          <div key={label} className="p-4 bg-[var(--n-bg-sunken)]">
            <dt className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--n-fg-faint)]">
              {label}
            </dt>
            <dd
              className={`mt-1.5 text-[13px] tabular-nums ${
                warn ? "text-[var(--color-warning)]" : "text-[var(--n-fg)]"
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-12 text-[11px] uppercase tracking-[0.16em] text-[var(--n-fg-faint)]">
        Active devices
      </h2>

      {license.devices.length === 0 ? (
        <p
          className="mt-3 py-6 text-[13px] text-[var(--n-fg-muted)]"
          style={{ borderTop: "1px solid var(--n-line-soft)" }}
        >
          No active devices. Activate data-peek on a machine and it will show up
          here.
        </p>
      ) : (
        <ul
          className="mt-3"
          style={{ borderBottom: "1px solid var(--n-line-soft)" }}
        >
          {license.devices.map((device) => (
            <DeviceRow
              key={device.instanceId}
              device={device}
              removing={removing.has(device.instanceId)}
              onRemove={() => onRemove(device.instanceId)}
            />
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--color-error)]">
          {error}
        </p>
      )}
    </div>
  );
}

function DeviceRow({
  device,
  removing,
  onRemove,
}: {
  device: LicenseDevice;
  removing: boolean;
  onRemove: () => void;
}) {
  const details = [device.os, device.appVersion && `v${device.appVersion}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] items-center gap-x-8 gap-y-2 py-4"
      style={{ borderTop: "1px solid var(--n-line-soft)" }}
    >
      <div className="min-w-0">
        <div className="truncate text-[13px] text-[var(--n-fg)]">
          {device.deviceName ?? "Unnamed device"}
        </div>
        {details && (
          <div className="mt-0.5 text-[12px] text-[var(--n-fg-muted)]">
            {details}
          </div>
        )}
      </div>
      <DateCell label="Activated" iso={device.activatedAt} />
      <DateCell label="Last activated" iso={device.lastValidatedAt} />
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label={`Remove ${device.deviceName ?? "unnamed device"}`}
        className="h-8 px-3 justify-self-start sm:justify-self-end inline-flex items-center text-[12px] text-[var(--n-fg-muted)] hover:text-[var(--n-fg)] disabled:opacity-60"
        style={{ border: "1px solid var(--n-line)" }}
      >
        {removing ? "Removing…" : "Remove"}
      </button>
    </li>
  );
}

function DateCell({ label, iso }: { label: string; iso: string }) {
  return (
    <div className="text-[12px] tabular-nums">
      <span className="text-[var(--n-fg-faint)]">{label} </span>
      <span className="text-[var(--n-fg-muted)]">{day(iso)}</span>
    </div>
  );
}
