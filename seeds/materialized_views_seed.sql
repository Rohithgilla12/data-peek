-- Materialized Views Seed for data-peek
-- Run this AFTER acme_saas_seed.sql
-- PostgreSQL only (materialized views are not supported in MySQL)

-- Monthly Revenue Summary
-- Aggregates invoice data by month - useful for dashboard widgets
CREATE MATERIALIZED VIEW mv_monthly_revenue AS
SELECT
    DATE_TRUNC('month', created_at) AS month,
    COUNT(*) AS invoice_count,
    SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END) AS paid_amount_cents,
    SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END) AS pending_amount_cents,
    SUM(CASE WHEN status = 'failed' THEN amount_cents ELSE 0 END) AS failed_amount_cents,
    COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_count,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed_count,
    ROUND(
        COUNT(CASE WHEN status = 'paid' THEN 1 END)::NUMERIC /
        NULLIF(COUNT(CASE WHEN status IN ('paid', 'failed') THEN 1 END), 0) * 100,
        2
    ) AS success_rate_pct
FROM invoices
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

CREATE UNIQUE INDEX idx_mv_monthly_revenue_month ON mv_monthly_revenue(month);

-- Organization Dashboard Metrics
-- Pre-computed stats for each organization
CREATE MATERIALIZED VIEW mv_organization_metrics AS
SELECT
    o.id AS organization_id,
    o.name AS organization_name,
    o.slug,
    o.plan,
    o.created_at AS org_created_at,
    COUNT(DISTINCT m.user_id) AS total_members,
    COUNT(DISTINCT CASE WHEN m.role = 'owner' THEN m.user_id END) AS owner_count,
    COUNT(DISTINCT CASE WHEN m.role = 'admin' THEN m.user_id END) AS admin_count,
    COUNT(DISTINCT p.id) AS total_projects,
    COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) AS active_projects,
    COUNT(DISTINCT CASE WHEN p.status = 'archived' THEN p.id END) AS archived_projects,
    COUNT(DISTINCT ak.id) AS total_api_keys,
    COUNT(DISTINCT CASE WHEN ak.revoked_at IS NULL AND (ak.expires_at IS NULL OR ak.expires_at > NOW()) THEN ak.id END) AS active_api_keys,
    COALESCE(SUM(i.amount_cents) FILTER (WHERE i.status = 'paid'), 0) AS total_paid_cents,
    s.status AS subscription_status,
    s.current_period_end AS subscription_ends_at
FROM organizations o
LEFT JOIN memberships m ON o.id = m.organization_id
LEFT JOIN projects p ON o.id = p.organization_id
LEFT JOIN api_keys ak ON o.id = ak.organization_id
LEFT JOIN invoices i ON o.id = i.organization_id
LEFT JOIN subscriptions s ON o.id = s.organization_id
GROUP BY o.id, o.name, o.slug, o.plan, o.created_at, s.status, s.current_period_end;

CREATE UNIQUE INDEX idx_mv_organization_metrics_org_id ON mv_organization_metrics(organization_id);
CREATE INDEX idx_mv_organization_metrics_plan ON mv_organization_metrics(plan);

-- User Activity Summary
-- Aggregates user engagement metrics
CREATE MATERIALIZED VIEW mv_user_activity_summary AS
SELECT
    u.id AS user_id,
    u.email,
    u.name,
    u.created_at AS user_created_at,
    u.last_login_at,
    u.email_verified_at IS NOT NULL AS is_verified,
    COUNT(DISTINCT m.organization_id) AS organization_count,
    COUNT(DISTINCT CASE WHEN m.role = 'owner' THEN m.organization_id END) AS owned_orgs,
    COUNT(DISTINCT e.id) AS total_events,
    MAX(e.created_at) AS last_event_at,
    EXTRACT(DAY FROM NOW() - u.last_login_at) AS days_since_login,
    CASE
        WHEN u.last_login_at > NOW() - INTERVAL '1 day' THEN 'active'
        WHEN u.last_login_at > NOW() - INTERVAL '7 days' THEN 'recent'
        WHEN u.last_login_at > NOW() - INTERVAL '30 days' THEN 'inactive'
        ELSE 'dormant'
    END AS activity_status
FROM users u
LEFT JOIN memberships m ON u.id = m.user_id
LEFT JOIN events e ON u.id = e.user_id
GROUP BY u.id, u.email, u.name, u.created_at, u.last_login_at, u.email_verified_at;

CREATE UNIQUE INDEX idx_mv_user_activity_user_id ON mv_user_activity_summary(user_id);
CREATE INDEX idx_mv_user_activity_status ON mv_user_activity_summary(activity_status);

-- API Key Usage Analytics
-- Tracks API key usage patterns
CREATE MATERIALIZED VIEW mv_api_key_analytics AS
SELECT
    ak.id AS api_key_id,
    ak.name AS key_name,
    ak.key_prefix,
    o.id AS organization_id,
    o.name AS organization_name,
    o.plan AS org_plan,
    ak.scopes,
    ak.created_at AS key_created_at,
    ak.last_used_at,
    ak.expires_at,
    ak.revoked_at,
    CASE
        WHEN ak.revoked_at IS NOT NULL THEN 'revoked'
        WHEN ak.expires_at IS NOT NULL AND ak.expires_at < NOW() THEN 'expired'
        WHEN ak.last_used_at IS NULL THEN 'never_used'
        WHEN ak.last_used_at > NOW() - INTERVAL '1 day' THEN 'active'
        WHEN ak.last_used_at > NOW() - INTERVAL '7 days' THEN 'recent'
        ELSE 'stale'
    END AS key_status,
    EXTRACT(DAY FROM NOW() - ak.created_at) AS age_days,
    EXTRACT(DAY FROM ak.expires_at - NOW()) AS days_until_expiry
FROM api_keys ak
JOIN organizations o ON ak.organization_id = o.id;

CREATE UNIQUE INDEX idx_mv_api_key_analytics_id ON mv_api_key_analytics(api_key_id);
CREATE INDEX idx_mv_api_key_analytics_status ON mv_api_key_analytics(key_status);
CREATE INDEX idx_mv_api_key_analytics_org ON mv_api_key_analytics(organization_id);

-- Subscription Health Dashboard
-- Overview of subscription metrics by plan
CREATE MATERIALIZED VIEW mv_subscription_health AS
SELECT
    plan,
    COUNT(*) AS total_subscriptions,
    COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_count,
    COUNT(CASE WHEN status = 'past_due' THEN 1 END) AS past_due_count,
    COUNT(CASE WHEN status = 'canceled' THEN 1 END) AS canceled_count,
    COUNT(CASE WHEN status = 'trialing' THEN 1 END) AS trialing_count,
    ROUND(
        COUNT(CASE WHEN status = 'active' THEN 1 END)::NUMERIC /
        NULLIF(COUNT(*), 0) * 100,
        2
    ) AS health_score_pct,
    AVG(EXTRACT(DAY FROM current_period_end - current_period_start)) AS avg_period_days,
    COUNT(CASE WHEN cancel_at IS NOT NULL AND cancel_at > NOW() THEN 1 END) AS pending_cancellations
FROM subscriptions
GROUP BY plan;

CREATE UNIQUE INDEX idx_mv_subscription_health_plan ON mv_subscription_health(plan);

-- Event Analytics by Type
-- Aggregates events for analytics dashboards
CREATE MATERIALIZED VIEW mv_event_analytics AS
SELECT
    type AS event_type,
    DATE_TRUNC('day', created_at) AS event_date,
    COUNT(*) AS event_count,
    COUNT(DISTINCT user_id) AS unique_users,
    COUNT(DISTINCT organization_id) AS unique_orgs,
    COUNT(DISTINCT ip_address) AS unique_ips
FROM events
GROUP BY type, DATE_TRUNC('day', created_at)
ORDER BY event_date DESC, event_count DESC;

CREATE UNIQUE INDEX idx_mv_event_analytics_type_date ON mv_event_analytics(event_type, event_date);
CREATE INDEX idx_mv_event_analytics_date ON mv_event_analytics(event_date);

-- Feature Flag Rollout Summary
-- Summary of feature flag adoption
CREATE MATERIALIZED VIEW mv_feature_flag_summary AS
SELECT
    ff.id AS flag_id,
    ff.name AS flag_name,
    ff.enabled,
    ff.rollout_percentage,
    ff.created_at,
    ff.updated_at,
    COALESCE(ARRAY_LENGTH(ff.allowed_organizations, 1), 0) AS explicitly_allowed_orgs,
    CASE
        WHEN NOT ff.enabled THEN 'disabled'
        WHEN ff.rollout_percentage = 100 THEN 'fully_rolled_out'
        WHEN ff.rollout_percentage > 50 THEN 'majority_rollout'
        WHEN ff.rollout_percentage > 0 THEN 'partial_rollout'
        WHEN ARRAY_LENGTH(ff.allowed_organizations, 1) > 0 THEN 'allowlist_only'
        ELSE 'no_access'
    END AS rollout_status,
    (ff.metadata->>'beta')::boolean AS is_beta
FROM feature_flags ff;

CREATE UNIQUE INDEX idx_mv_feature_flag_summary_id ON mv_feature_flag_summary(flag_id);
CREATE INDEX idx_mv_feature_flag_summary_status ON mv_feature_flag_summary(rollout_status);

-- Project Activity Heatmap Data
-- For visualization of project activity patterns
CREATE MATERIALIZED VIEW mv_project_heatmap AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,
    o.name AS organization_name,
    o.plan AS org_plan,
    p.created_at,
    p.updated_at,
    EXTRACT(DOW FROM p.created_at) AS created_day_of_week,
    EXTRACT(HOUR FROM p.created_at) AS created_hour,
    p.settings->>'environment' AS environment,
    p.settings->>'framework' AS framework
FROM projects p
JOIN organizations o ON p.organization_id = o.id;

CREATE UNIQUE INDEX idx_mv_project_heatmap_id ON mv_project_heatmap(project_id);
CREATE INDEX idx_mv_project_heatmap_status ON mv_project_heatmap(project_status);
CREATE INDEX idx_mv_project_heatmap_org ON mv_project_heatmap(organization_name);

-- Summary
--
-- Materialized views created:
--   1. mv_monthly_revenue - Monthly invoice/revenue aggregations
--   2. mv_organization_metrics - Per-org dashboard stats
--   3. mv_user_activity_summary - User engagement metrics
--   4. mv_api_key_analytics - API key usage patterns
--   5. mv_subscription_health - Subscription metrics by plan
--   6. mv_event_analytics - Event counts by type and day
--   7. mv_feature_flag_summary - Feature flag rollout status
--   8. mv_project_heatmap - Project activity visualization data
--
-- To refresh all materialized views:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_revenue;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_organization_metrics;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_activity_summary;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_api_key_analytics;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_subscription_health;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_event_analytics;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_feature_flag_summary;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_heatmap;
