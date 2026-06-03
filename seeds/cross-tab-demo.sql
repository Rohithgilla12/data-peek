-- Cross-Tab @name references — test data + runbook (Postgres)
--
-- Self-contained: traffic_events has no foreign keys, so this file loads on
-- its own. Load it into the SAME database as acme_saas_seed.sql to also run
-- the users/memberships/events examples at the bottom.
--
-- Why this exists: every acme_saas table is <= 20 rows, which never trips the
-- cross-tab heavy-confirm dialog (fires when an inlined reference exceeds
-- 1,000 rows or 256 KB) or the hard cap (refuses references over 10,000 rows
-- or 5 MB). traffic_events is 12,000 rows so you can exercise both thresholds.

DROP TABLE IF EXISTS traffic_events;

CREATE TABLE traffic_events (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL,
    path        TEXT NOT NULL,
    country     TEXT NOT NULL,
    status_code INT  NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL
);

-- 12,000 rows, ~4,000 distinct sessions across 8 countries.
INSERT INTO traffic_events (session_id, path, country, status_code, created_at)
SELECT
    'sess_' || (1 + floor(random() * 4000))::int,
    (ARRAY['/', '/pricing', '/docs', '/login', '/app', '/blog'])[1 + floor(random() * 6)::int],
    (ARRAY['US', 'GB', 'DE', 'IN', 'BR', 'JP', 'CA', 'AU'])[1 + floor(random() * 8)::int],
    (ARRAY[200, 200, 200, 301, 404, 500])[1 + floor(random() * 6)::int],
    NOW() - (random() * INTERVAL '90 days')
FROM generate_series(1, 12000);

CREATE INDEX idx_traffic_events_country ON traffic_events (country);
CREATE INDEX idx_traffic_events_session ON traffic_events (session_id);


-- Runbook ---------------------------------------------------------------------
-- Name a tab: right-click the tab → "Name as @…", type the name, Enter.
-- Then reference it from another tab's SQL. Run with Cmd/Ctrl+Enter.
--
-- 1) Core flow (runs immediately, shows the "refs inlined" pill)
--    Tab A:  SELECT DISTINCT session_id FROM traffic_events
--            WHERE country = 'US' ORDER BY session_id LIMIT 400;
--    Name Tab A:  @us_sessions
--    Tab B:  SELECT country, count(*) FROM traffic_events
--            WHERE session_id IN (SELECT session_id FROM @us_sessions)
--            GROUP BY country ORDER BY count(*) DESC;
--    Expect: result lands; toolbar pill "1 ref · 400 rows inlined".
--
-- 2) Autocomplete + hover + diagnostics (no run needed)
--    In Tab B, type "SELECT * FROM @"  → autocomplete lists @us_sessions
--      with "400 rows · 1 cols". Hover @us_sessions → preview popover.
--    Type "SELECT * FROM @ghost"       → red squiggle "No tab named @ghost".
--    Open a new tab, name it @draft but DON'T run it, then reference @draft
--      → amber squiggle "@draft hasn't been run yet."
--
-- 3) Heavy-confirm dialog (>1,000 inlined rows)
--    Tab A:  SELECT * FROM traffic_events
--            WHERE country IN ('US', 'GB', 'DE') LIMIT 2000;
--    Name Tab A:  @big_sample
--    Tab B:  SELECT count(*) FROM @big_sample;
--    Expect: a confirm dialog ("Running with 1 tab reference · 2,000 rows").
--      Cancel aborts; "Run query" proceeds; the "don't ask again this
--      session" checkbox suppresses it for the rest of the session.
--
-- 4) Hard cap (>10,000 rows → refused)
--    Tab A:  SELECT * FROM traffic_events;     -- 12,000 rows
--    Name Tab A:  @everything
--    Tab B:  SELECT count(*) FROM @everything;
--    Expect: error banner "@everything has 12000 rows (cap 10,000). Add a
--      LIMIT to the referenced query." (no query is sent to the DB).
--
-- 5) Error on a never-run / unknown ref (the run path, not just the editor)
--    Run "SELECT * FROM @ghost" → banner "No tab named @ghost on this
--      connection." Run "SELECT * FROM @draft" (named, never run) → banner
--      "@draft hasn't been run yet — run it first."
--
-- 6) Cross-connection isolation (needs two connections)
--    Name @us_sessions on connection A. Open a query tab on connection B and
--      reference @us_sessions → it is NOT found (red squiggle + the same
--      "No tab named …" error). Names are scoped per connection.
--
-- 7) Multi-dialect spot check (optional)
--    Load acme_saas_mysql_seed.sql into a MySQL connection. Name a SELECT and
--      reference it — note @offset / @count user-variables are left untouched
--      (only registered tab names resolve on MySQL/MSSQL).


-- Examples using acme_saas_seed.sql (load both files into one database) -------
-- Tab A:  SELECT user_id FROM memberships WHERE role = 'owner';
-- Name Tab A:  @owners
-- Tab B:  SELECT u.name, count(e.id) AS events
--         FROM users u
--         JOIN events e ON e.user_id = u.id
--         WHERE u.id IN (SELECT user_id FROM @owners)
--         GROUP BY u.name
--         ORDER BY events DESC;
