# Multi-Harness BYOH: Codex CLI Support — Design

**Date:** 2026-08-05
**Status:** Approved
**Driver:** Customer requests for Codex CLI support (and open-source harnesses opencode/Pi) in data-peek's AI features.

## Summary

Generalise the bring-your-own-harness (BYOH) feature — today hard-wired to the
Claude Code CLI in `apps/desktop/src/main/harness-service.ts` — into a
`HarnessAdapter` abstraction mirroring the existing `DatabaseAdapter` pattern,
and ship **Codex CLI** as the second harness. opencode and Pi become follow-up
adapters once the seam exists; they are out of scope for this round.

BYOH stance is unchanged: data-peek shells out to the user's own locally
installed, locally authenticated CLI. No API key or token is ever stored or
injected by data-peek.

## Scope

**In:** Codex CLI harness with structured chat + agentic MCP grounding
(required), plus streaming/resume/dashboard where the CLI supports them
cleanly (degrade gracefully otherwise). Refactor of the harness layer into
adapters. Settings UI, shared types, docs/marketing updates.

**Out:** opencode and Pi adapters (fast follow-ups), ACP protocol support,
any change to API-key providers or the AI SDK path.

## Parity bar (decided)

Structured chat with agentic grounding is the launch requirement. Streaming,
session resume, and dashboard generation light up per-harness only where the
CLI supports them; the UI shows a coarser progress state otherwise.

## Architecture

```
src/main/harness/
  types.ts            # HarnessAdapter interface + HarnessCapabilities + HarnessRequest
  runner.ts           # generic: spawn, PATH augmentation, timeouts, NDJSON/JSONL
                      # line buffering — extracted verbatim from harness-service.ts
  service.ts          # orchestrator: pick adapter by provider, build request, run,
                      # validate (responseSchema / dashboardSpecSchema), compute
                      # grounded/meta. The only module ai-service.ts imports.
  adapters/
    claude-code.ts    # today's argv building, envelope parsing, harness-stream logic
    codex.ts          # new
```

### Adapter interface

```typescript
interface HarnessAdapter {
  id: 'claude-cli' | 'codex-cli' // extends with 'opencode' | 'pi' later
  capabilities: {
    streaming: boolean        // token-level partial messages
    resume: boolean           // multi-turn session memory
    inlineJsonSchema: boolean // schema passed inline vs temp file
    dashboard: boolean        // trusted for dashboard generation
  }
  detect(): Promise<HarnessDetection>
  buildRequest(input: HarnessInput): HarnessRequest // pure: argv + env + temp files
  classifyEvent(line: unknown): StreamInfo          // stream line → deltas/tool labels
  parseResult(raw: unknown): HarnessResult          // text/structured + turns/sessionId/denials
}
```

`buildRequest`, `classifyEvent`, and `parseResult` are pure functions,
unit-tested exactly like today's `buildHarnessArgs`/`parseHarnessResult`.
Zod validation and grounded-ness rules live once in `service.ts`; adapters
never touch schema validation, so no harness can return an unvalidated shape.

### Integration points

- `packages/shared/src/index.ts`: add `codex-cli` to the `AIProvider` union,
  `AI_PROVIDERS`, `DEFAULT_MODELS`, and `KEYLESS_AI_PROVIDERS`. The existing
  exhaustiveness checks force every switch to be extended.
- `ai-service.ts`: replace `provider === 'claude-cli'` checks with
  `isHarnessProvider(provider)` routing into `harness/service.ts`.
- IPC `ai:detect-harness` gains a `provider` argument; preload `detectHarness`
  updated accordingly.
- Renderer settings modal: already renders keyless providers with a detect
  row; passes the selected provider through to detection.

## Codex adapter specifics

Verified against codex-cli 0.146.0 (`codex exec --help`, `codex mcp add --help`).

**Detection.** Candidate bin dirs + augmented PATH (same list as Claude),
`DATA_PEEK_CODEX_PATH` override, `codex --version`, 10s ceiling.

**One-shot structured chat.**

```
codex exec "<prompt>" --json -s read-only --skip-git-repo-check \
  -C <per-run scratch dir> --output-schema <tmp schema file> [-m <model>]
```

- **System prompt:** Codex has no `--append-system-prompt`; the adapter
  prepends the system prompt to the prompt body
  (`## Instructions\n…\n\n## Request\n…`). Content identical to
  `buildSystemPrompt` today. (`experimental_instructions_file` is avoided —
  it replaces Codex's base instructions.)
- **Structured output:** `--output-schema` takes a file path, so
  `RESPONSE_JSON_SCHEMA_STRING` is written to a per-call temp file, removed
  in `finally`. Final agent message parsed from the terminal JSONL event and
  validated by `service.ts` with the same Zod schema.
- **Model:** default is "CLI default" (omit `-m`, ride the user's Codex
  config), plus a small curated override list in `AI_PROVIDERS`.

**Agentic grounding.** Inject data-peek's MCP server per invocation — the
user's `config.toml` is never modified:

```
--ignore-user-config \
-c mcp_servers.datapeek.url="<mcp url>" \
-c mcp_servers.datapeek.bearer_token_env_var="DATA_PEEK_MCP_TOKEN"
```

- The bearer token is passed via spawn env, never argv (argv is visible in
  `ps`).
- `--ignore-user-config` is the Codex analogue of Claude's
  `--strict-mcp-config`: the user's own MCP servers (which may have side
  effects) never load into a data-peek chat. Auth still uses `CODEX_HOME`.
- Tool restriction to the three read tools (`list_schemas`, `run_query`,
  `explain_query`) uses Codex's per-server tool allow-list config if the
  installed version supports it — **verify at implementation**. Backstop
  either way: `execute_statement` requires data-peek's in-app approval,
  which a headless run cannot answer, so writes fail closed on every harness.

**Capability matrix at launch.**

| Capability | claude-cli | codex-cli |
|---|---|---|
| Structured chat + grounding | Yes | Yes (required) |
| Token-level streaming | Yes | Partial — tool/turn activity labels stream from JSONL; message text may land only at completion. The UI already treats activity and message events independently. |
| Session resume | Yes (`--resume`) | Expected via `codex exec resume <id>` (session id captured from the JSONL stream) — **verify**; degrade to full-transcript replay if flaky. |
| Dashboard generation | Yes | Same call shape, so attempt it; if testing shows unreliability, `capabilities.dashboard = false` and the UI says "not supported by this harness yet". |

**Grounded-ness rule** (unchanged, computed once in `service.ts`): agentic
AND tool round-trips happened (turns > 1) AND zero denials — so the
"grounded" badge means the same thing on every harness.

## Error handling

- **Not installed:** ENOENT maps to a per-harness message ("Codex CLI not
  found. Install it and run `codex login` once."). Adapter owns the message;
  runner owns the mechanism.
- **CLI-reported failures:** Codex surfaces errors as JSONL error/turn-failed
  events; `parseResult` maps common cases to actionable text (auth expired →
  "run `codex login`", usage limits stated plainly). Fallback: stderr tail +
  exit code.
- **Timeouts:** request-kind properties, kept in `service.ts` — 120s one-shot,
  180s agentic, 300s dashboard.
- **Temp schema files:** app temp dir, removed in `finally`.
- **Claude regression safety:** the extraction is behaviour-preserving; the
  existing `harness-service.test.ts` assertions migrate unmodified to the
  claude-code adapter + service suites and must stay green.

## Testing

- **Unit (bulk):** pure `buildRequest`/`parseResult`/`classifyEvent` per
  adapter against real captured fixtures (capture `codex exec --json` output
  locally and check the JSONL into fixtures, as done for Claude envelopes).
- **Service:** provider routing, grounded-ness computation, capability-based
  degradation.
- **Shared:** `AIProvider` exhaustiveness already forces completeness across
  `ai-providers.test.ts` and `DEFAULT_MODELS`.
- **Manual:** agentic chat against a seed database (`seeds/`) on both
  harnesses; confirm the grounded badge and a denied write failing closed.

## Documentation

Per the project rule, update all three: README features section, `docs/`
pages, and the marketing site — "bring your own agent: Claude Code or Codex".

## Open items to verify during implementation

1. Codex per-MCP-server tool allow-list config key and support in 0.146.0.
2. `codex exec resume <id>` behaviour with `--ignore-user-config` and JSONL
   session-id capture.
3. Whether `codex exec --json` emits incremental agent-message deltas (bonus
   streaming fidelity) or only completed items.
