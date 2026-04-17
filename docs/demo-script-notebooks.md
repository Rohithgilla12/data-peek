# SQL Notebooks — Demo Script

Recording guide for the SQL Notebooks feature demo video.

## Setup

- Database: `localhost:5433` / `acme_saas` / `demo` / `demo` (Docker container `datapeek-demo`)
- Start container: `docker start datapeek-demo`
- Seed file: `seeds/acme_saas_seed.sql`
- Demo runbook: `seeds/demo-runbook.dpnb` (import this or recreate live)

## Demo Flow (3-4 minutes)

### Scene 1: Create a Notebook (30s)

1. Open data-peek, connect to the ACME SaaS database
2. In the sidebar, show the **Notebooks** section
3. Click **+** to create a new notebook
4. Title it "ACME SaaS Health Check"
5. Show it opens as a new tab

### Scene 2: Add Markdown + SQL Cells (60s)

1. The notebook starts empty — click **+ Markdown cell**
2. Type: `# Platform Overview` and a short description
3. Click away — show it renders as formatted markdown
4. Click **+ SQL cell**
5. Type the platform overview query:
   ```sql
   SELECT o.plan, COUNT(DISTINCT o.id) AS orgs,
     COUNT(DISTINCT m.user_id) AS users
   FROM organizations o
   LEFT JOIN memberships m ON m.organization_id = o.id
   GROUP BY o.plan ORDER BY orgs DESC
   ```
6. Press **Shift+Enter** — results appear inline, focus moves to next position
7. Add another markdown cell: "## Revenue Health" with explanation
8. Add another SQL cell with the subscription query
9. **Shift+Enter** through it — show the run-and-advance flow

### Scene 3: Pin Results (30s)

1. On the platform overview cell, click the **...** menu
2. Click **Pin result**
3. Show the "Pinned — ran [date]" header appears
4. Close the notebook tab
5. Reopen from sidebar — pinned result is still there

### Scene 4: Keyboard Navigation (30s)

1. Press **Cmd+J** / **Cmd+K** — show focus moving between cells
2. Press **Enter** on a SQL cell — enters edit mode
3. Press **Escape** — exits back to cell navigation
4. Press **Cmd+Shift+D** — deletes a cell
5. Show the bottom shortcut bar

### Scene 5: Import the Full Runbook (30s)

1. Delete the notebook you just made (or create a new one)
2. Import `seeds/demo-runbook.dpnb` (File → Import or drag to sidebar)
3. Show the full 7-step health check runbook loads
4. **Cmd+Shift+Enter** (Run All) — watch the execution wave flow through each cell
5. Show results appearing one by one

### Scene 6: Export & Share (30s)

1. From the toolbar **...** menu, click **Export as Markdown**
2. Open the exported `.md` file — show it's readable with SQL blocks and result tables
3. Mention: "Send this to a teammate, they can read it without data-peek"
4. Show **Export as .dpnb** — "Or send this, and they can import it and run it themselves"

### Scene 7: Duplicate to Connection (15s)

1. Right-click the notebook in the sidebar
2. Click **Duplicate to connection...**
3. Pick a different connection (e.g. staging)
4. Show the copy appears with "(copy)" suffix

## Key Moments to Highlight

- **Shift+Enter flow** — the Jupyter muscle memory, run-and-advance
- **Pinned results persisting** — close and reopen, data is still there
- **The runbook use case** — "your Notion doc + SQL client, collapsed into one"
- **Export as Markdown** — readable anywhere, no vendor lock-in

## Recording Tips

- Use dark mode (primary design target)
- Keep the sidebar open to show the Notebooks section
- Zoom to ~125% so cell content is readable in the video
- No narration needed if adding captions — keep it tight
- Target 1080p, 60fps for smooth scroll/transitions
