-- ACME Analytics: ClickHouse sample database for data-peek.
-- Deterministic: every row derives from numbers(), so counts and aggregates are stable.

CREATE DATABASE IF NOT EXISTS acme_analytics;

CREATE TABLE acme_analytics.organizations
(
    id UInt32,
    name String,
    plan Enum8('free' = 1, 'starter' = 2, 'pro' = 3, 'enterprise' = 4),
    country LowCardinality(String),
    created_at DateTime('UTC')
)
ENGINE = MergeTree
ORDER BY id;

INSERT INTO acme_analytics.organizations
SELECT
    number + 1,
    concat('Org ', toString(number + 1)),
    toInt8(number % 4) + 1,
    ['US', 'GB', 'DE', 'IN', 'SG'][number % 5 + 1],
    toDateTime('2025-01-01 00:00:00', 'UTC') + toIntervalDay(number)
FROM numbers(50);

CREATE TABLE acme_analytics.users
(
    id UInt64,
    org_id UInt32,
    email String,
    display_name Nullable(String),
    version UInt32,
    signed_up_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(version)
ORDER BY id;

INSERT INTO acme_analytics.users
SELECT
    number + 1,
    toUInt32(number % 50) + 1,
    concat('user', toString(number + 1), '@acme.test'),
    if(number % 7 = 0, NULL, concat('User ', toString(number + 1))),
    1,
    toDateTime64('2025-01-01 00:00:00', 3, 'UTC') + toIntervalMinute(number * 37)
FROM numbers(1000);

CREATE TABLE acme_analytics.events
(
    event_id UUID,
    org_id UInt32,
    user_id UInt64,
    event_type LowCardinality(String),
    event_time DateTime64(3, 'UTC'),
    status Enum8('ok' = 1, 'error' = 2),
    revenue Nullable(Decimal(18, 4)),
    duration_ms Float64,
    tags Array(String),
    properties Map(String, String),
    is_bot Bool,
    big_counter UInt64
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (org_id, event_time);

INSERT INTO acme_analytics.events
SELECT
    generateUUIDv4(),
    toUInt32(number % 50) + 1,
    (number % 1000) + 1,
    ['page_view', 'signup', 'purchase', 'api_call', 'logout'][number % 5 + 1],
    toDateTime64('2025-06-01 00:00:00', 3, 'UTC') + toIntervalSecond(number * 61),
    if(number % 20 = 0, 'error', 'ok'),
    if(number % 5 = 2, toDecimal64(number % 500, 4) + toDecimal64(0.99, 4), NULL),
    (number % 1000) * 1.5,
    arraySlice(['web', 'mobile', 'beta', 'eu'], 1, number % 4 + 1),
    map('plan', ['free', 'pro'][number % 2 + 1], 'region', ['us', 'eu'][number % 2 + 1]),
    number % 50 = 0,
    18446744073709551615 - number
FROM numbers(50000);

CREATE TABLE acme_analytics.daily_events
(
    day Date,
    event_type LowCardinality(String),
    events UInt64
)
ENGINE = SummingMergeTree
ORDER BY (day, event_type);

CREATE MATERIALIZED VIEW acme_analytics.daily_events_mv TO acme_analytics.daily_events AS
SELECT toDate(event_time) AS day, event_type, count() AS events
FROM acme_analytics.events
GROUP BY day, event_type;

INSERT INTO acme_analytics.daily_events
SELECT toDate(event_time) AS day, event_type, count() AS events
FROM acme_analytics.events
GROUP BY day, event_type;

CREATE VIEW acme_analytics.active_orgs AS
SELECT org_id, count() AS events, max(event_time) AS last_seen
FROM acme_analytics.events
WHERE status = 'ok'
GROUP BY org_id;

CREATE TABLE acme_analytics.`odd-names`
(
    `order` UInt32,
    `select` String,
    `has space` Nullable(String)
)
ENGINE = MergeTree
ORDER BY `order`;

INSERT INTO acme_analytics.`odd-names` VALUES (1, 'a;b', NULL), (2, 'it\'s', 'x'), (3, '-- not a comment', 'y');
