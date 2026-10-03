---
workflow: motion-graphics
flow: automation
storyboard: no
message: "Agents can read freely; every write waits for you"
destination: README + datapeek.dev
aspect: 16:10
length: 6s
language: en
---

# mcp-approval

A 6 s seamless loop (1920 × 1200, 30 fps, no audio) for the README and datapeek.dev.

## What the viewer sees

Left (~40%): a generic, unbranded agent terminal. Its transcript already shows a finished read
(`run_query`, read-only) and an idle prompt with a blue block caret. Right (~60%): a cropped
data-peek window on a `prod-orders` connection with the `orders` table open.

The agent issues `execute_statement` with a three-line `UPDATE orders ... WHERE id = 4182;`. A thin
blue pulse runs along the MCP link into data-peek, the window dims, and the real approval dialog
lands; its own copy carries the 60-second auto-reject. A pointer glides to
**Approve & run** and presses; the button flashes green and the dialog resolves. A pulse runs back
along the link, and the terminal prints the tool's real return value, `{ "rowCount": 1 }`, with a
green check. The write block clears and the frame settles back to exactly the opening state.

## Dominant motif

The press on **Approve & run** (2.4 to 3.4 s). Everything before builds to it; everything after
pays it off.

## Truth sources (copy is verbatim)

- Dialog: `apps/desktop/src/renderer/src/components/mcp-approval-dialog.tsx` lines 48 to 59
  (title, description, SQL in a `<pre>`, Reject and Approve & run).
- Timeout: `apps/desktop/src/main/mcp/approval.ts` line 16 (`timeoutMs = 60_000`), lines 24 to 28
  (timer resolves `false`, which is a rejection).
- Tool names and return shape: `apps/desktop/src/main/mcp/tools.ts` lines 88 (`run_query`),
  174 (`execute_statement`), 205 (`ok({ rowCount: result.rowCount })`).
- Docs framing: `apps/docs/content/docs/features/mcp-server.mdx`, "Writes wait for you".

## Honesty notes

- The real dialog shows the 60-second timeout as text only, so the piece shows no countdown UI.
- data-peek does not refresh the results grid after an MCP write, so the grid behind the dialog
  does not change.
- No agent or vendor names or logos. The agent is just "agent".
