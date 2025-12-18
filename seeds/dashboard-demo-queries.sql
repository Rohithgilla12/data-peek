-- ============================================================================
-- Dashboard Demo Queries for data-peek
-- ============================================================================
-- Use these queries to create widgets for a stunning demo dashboard.
-- Run against the acme_saas database (seeds/acme_saas_seed.sql)
-- ============================================================================

-- ============================================================================
-- KPI WIDGETS (Single row results)
-- ============================================================================

-- KPI: Total MRR (Monthly Recurring Revenue)
-- Widget: KPI | Format: Currency | Label: "Monthly Revenue"
SELECT ROUND(SUM(
    CASE s.plan
        WHEN 'enterprise' THEN 99900
        WHEN 'pro' THEN 4900
        WHEN 'starter' THEN 1900
        ELSE 0
    END
) / 100.0, 2) AS mrr
FROM subscriptions s
WHERE s.status = 'active';

-- KPI: Active Users (Last 30 days)
-- Widget: KPI | Format: Number | Label: "Active Users"
SELECT COUNT(DISTINCT user_id) AS active_users
FROM events
WHERE created_at > NOW() - INTERVAL '30 days';

-- KPI: Total Organizations
-- Widget: KPI | Format: Number | Label: "Total Organizations"
SELECT COUNT(*) AS total_orgs FROM organizations;

-- KPI: Paid Conversion Rate
-- Widget: KPI | Format: Percent | Label: "Paid Conversion"
SELECT
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE plan != 'free') / NULLIF(COUNT(*), 0),
        1
    ) AS conversion_rate
FROM organizations;

-- ============================================================================
-- LINE/AREA CHARTS (Time series)
-- ============================================================================

-- Revenue Trend (Last 12 months)
-- Widget: Line Chart | X: month | Y: revenue
SELECT
    TO_CHAR(DATE_TRUNC('month', i.created_at), 'Mon YYYY') AS month,
    ROUND(SUM(i.amount_cents) / 100.0, 2) AS revenue
FROM invoices i
WHERE i.status = 'paid'
  AND i.created_at > NOW() - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', i.created_at)
ORDER BY DATE_TRUNC('month', i.created_at);

-- User Signups Over Time (Last 30 days)
-- Widget: Area Chart | X: date | Y: signups
SELECT
    DATE(created_at) AS date,
    COUNT(*) AS signups
FROM users
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date;

-- Daily Active Events (Last 14 days)
-- Widget: Line Chart | X: date | Y: events
SELECT
    DATE(created_at) AS date,
    COUNT(*) AS events
FROM events
WHERE created_at > NOW() - INTERVAL '14 days'
GROUP BY DATE(created_at)
ORDER BY date;

-- ============================================================================
-- BAR CHARTS (Categorical comparisons)
-- ============================================================================

-- Organizations by Plan
-- Widget: Bar Chart | X: plan | Y: count
SELECT
    INITCAP(plan::text) AS plan,
    COUNT(*) AS count
FROM organizations
GROUP BY plan
ORDER BY
    CASE plan
        WHEN 'free' THEN 1
        WHEN 'starter' THEN 2
        WHEN 'pro' THEN 3
        WHEN 'enterprise' THEN 4
    END;

-- Top 10 Organizations by Revenue
-- Widget: Bar Chart | X: organization | Y: revenue
SELECT
    o.name AS organization,
    ROUND(SUM(i.amount_cents) / 100.0, 2) AS revenue
FROM organizations o
JOIN subscriptions s ON s.organization_id = o.id
JOIN invoices i ON i.subscription_id = s.id AND i.status = 'paid'
GROUP BY o.id, o.name
ORDER BY revenue DESC
LIMIT 10;

-- Events by Type
-- Widget: Bar Chart | X: event_type | Y: count
SELECT
    REPLACE(type::text, '.', ' ') AS event_type,
    COUNT(*) AS count
FROM events
GROUP BY type
ORDER BY count DESC;

-- Projects by Status
-- Widget: Bar Chart | X: status | Y: count
SELECT
    INITCAP(status::text) AS status,
    COUNT(*) AS count
FROM projects
GROUP BY status
ORDER BY count DESC;

-- ============================================================================
-- PIE CHARTS (Distribution)
-- ============================================================================

-- Revenue by Plan Type
-- Widget: Pie Chart | X: plan | Y: revenue
SELECT
    INITCAP(o.plan::text) AS plan,
    ROUND(SUM(i.amount_cents) / 100.0, 2) AS revenue
FROM organizations o
JOIN subscriptions s ON s.organization_id = o.id
JOIN invoices i ON i.subscription_id = s.id AND i.status = 'paid'
GROUP BY o.plan
ORDER BY revenue DESC;

-- User Distribution by Role
-- Widget: Pie Chart | X: role | Y: count
SELECT
    INITCAP(role::text) AS role,
    COUNT(*) AS count
FROM memberships
GROUP BY role
ORDER BY count DESC;

-- ============================================================================
-- TABLE WIDGETS (Detailed data)
-- ============================================================================

-- Recent Signups (Last 7 days)
-- Widget: Table | Max Rows: 10
SELECT
    u.name,
    u.email,
    o.name AS organization,
    INITCAP(o.plan::text) AS plan,
    TO_CHAR(u.created_at, 'Mon DD, HH24:MI') AS joined
FROM users u
LEFT JOIN memberships m ON m.user_id = u.id
LEFT JOIN organizations o ON o.id = m.organization_id
WHERE u.created_at > NOW() - INTERVAL '7 days'
ORDER BY u.created_at DESC
LIMIT 10;

-- Top Paying Customers
-- Widget: Table | Max Rows: 10
SELECT
    o.name AS organization,
    INITCAP(o.plan::text) AS plan,
    COUNT(DISTINCT m.user_id) AS users,
    '$' || ROUND(SUM(i.amount_cents) / 100.0, 2) AS total_revenue
FROM organizations o
JOIN memberships m ON m.organization_id = o.id
JOIN subscriptions s ON s.organization_id = o.id
JOIN invoices i ON i.subscription_id = s.id AND i.status = 'paid'
GROUP BY o.id, o.name, o.plan
ORDER BY SUM(i.amount_cents) DESC
LIMIT 10;

-- Recent Events
-- Widget: Table | Max Rows: 15
SELECT
    REPLACE(e.type::text, '.', ' ') AS event,
    u.name AS user_name,
    o.name AS organization,
    TO_CHAR(e.created_at, 'Mon DD HH24:MI') AS time
FROM events e
LEFT JOIN users u ON u.id = e.user_id
LEFT JOIN organizations o ON o.id = e.organization_id
ORDER BY e.created_at DESC
LIMIT 15;

-- ============================================================================
-- SUGGESTED DASHBOARD LAYOUT
-- ============================================================================
--
-- Row 1 (KPIs - 3 columns each):
-- [Monthly Revenue] [Active Users] [Total Organizations] [Paid Conversion]
--
-- Row 2 (Full width):
-- [Revenue Trend - Line Chart - 12 columns]
--
-- Row 3 (Half and half):
-- [Organizations by Plan - Bar - 6 cols] [Revenue by Plan - Pie - 6 cols]
--
-- Row 4 (Full width):
-- [Top Paying Customers - Table - 12 columns]
--
-- ============================================================================
