import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
  jsonb,
  date,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

// Re-export existing customers table reference for foreign keys.
// This app shares the same database as apps/web, so these tables already exist.
// We reference them here so Drizzle can build relations.
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  clerkUserId: text('clerk_user_id').unique(),
  dodoCustomerId: text('dodo_customer_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const licenses = pgTable('licenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .references(() => customers.id)
    .notNull(),
  licenseKey: text('license_key').notNull().unique(),
  plan: text('plan').notNull().default('pro'),
  status: text('status').notNull().default('active'),
  maxActivations: integer('max_activations').notNull().default(3),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).defaultNow().notNull(),
  updatesUntil: timestamp('updates_until', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const userConnections = pgTable(
  'user_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .references(() => customers.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    dbType: text('db_type').notNull(), // 'postgresql' | 'mysql'
    environment: text('environment').notNull().default('development'),
    encryptedCredentials: bytea('encrypted_credentials').notNull(),
    iv: bytea('iv').notNull(),
    authTag: bytea('auth_tag').notNull(),
    sslEnabled: boolean('ssl_enabled').notNull().default(false),
    lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_user_connections_customer').on(table.customerId)]
)

export const savedQueries = pgTable(
  'saved_queries_web',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .references(() => customers.id, { onDelete: 'cascade' })
      .notNull(),
    connectionId: uuid('connection_id')
      .references(() => userConnections.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    query: text('query').notNull(),
    description: text('description'),
    category: text('category'),
    tags: text('tags').array(),
    usageCount: integer('usage_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_saved_queries_web_customer').on(table.customerId),
    index('idx_saved_queries_web_connection').on(table.connectionId),
  ]
)

export const queryHistory = pgTable(
  'query_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .references(() => customers.id, { onDelete: 'cascade' })
      .notNull(),
    connectionId: uuid('connection_id')
      .references(() => userConnections.id, { onDelete: 'cascade' })
      .notNull(),
    query: text('query').notNull(),
    status: text('status').notNull(), // 'success' | 'error'
    durationMs: integer('duration_ms'),
    rowCount: integer('row_count'),
    errorMessage: text('error_message'),
    executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_query_history_customer').on(table.customerId),
    index('idx_query_history_connection').on(table.connectionId),
    index('idx_query_history_executed_at').on(table.executedAt),
  ]
)

export const dashboards = pgTable(
  'dashboards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .references(() => customers.id, { onDelete: 'cascade' })
      .notNull(),
    connectionId: uuid('connection_id')
      .references(() => userConnections.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    layout: jsonb('layout'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_dashboards_customer').on(table.customerId)]
)

export const dashboardWidgets = pgTable(
  'dashboard_widgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dashboardId: uuid('dashboard_id')
      .references(() => dashboards.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(), // 'table' | 'chart' | 'kpi'
    title: text('title').notNull(),
    query: text('query').notNull(),
    config: jsonb('config'),
    position: jsonb('position'),
    refreshInterval: integer('refresh_interval'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_dashboard_widgets_dashboard').on(table.dashboardId)]
)

export const userSettings = pgTable(
  'user_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .references(() => customers.id, { onDelete: 'cascade' })
      .notNull(),
    theme: text('theme').notNull().default('dark'),
    editorConfig: jsonb('editor_config'),
    encryptedAiKeys: bytea('encrypted_ai_keys'),
    aiIv: bytea('ai_iv'),
    aiAuthTag: bytea('ai_auth_tag'),
    activeAiProvider: text('active_ai_provider'),
    activeAiModel: text('active_ai_model'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('idx_user_settings_customer').on(table.customerId)]
)

export const usageTracking = pgTable(
  'usage_tracking',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .references(() => customers.id, { onDelete: 'cascade' })
      .notNull(),
    date: date('date').notNull(),
    queryCount: integer('query_count').notNull().default(0),
    aiMessageCount: integer('ai_message_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('idx_usage_tracking_customer_date').on(table.customerId, table.date)]
)

// Relations
export const licensesRelations = relations(licenses, ({ one }) => ({
  customer: one(customers, {
    fields: [licenses.customerId],
    references: [customers.id],
  }),
}))

export const customersRelations = relations(customers, ({ many, one }) => ({
  connections: many(userConnections),
  savedQueries: many(savedQueries),
  queryHistory: many(queryHistory),
  dashboards: many(dashboards),
  licenses: many(licenses),
  settings: one(userSettings),
}))

export const userConnectionsRelations = relations(userConnections, ({ one, many }) => ({
  customer: one(customers, {
    fields: [userConnections.customerId],
    references: [customers.id],
  }),
  savedQueries: many(savedQueries),
  queryHistory: many(queryHistory),
  dashboards: many(dashboards),
}))

export const savedQueriesRelations = relations(savedQueries, ({ one }) => ({
  customer: one(customers, {
    fields: [savedQueries.customerId],
    references: [customers.id],
  }),
  connection: one(userConnections, {
    fields: [savedQueries.connectionId],
    references: [userConnections.id],
  }),
}))

export const queryHistoryRelations = relations(queryHistory, ({ one }) => ({
  customer: one(customers, {
    fields: [queryHistory.customerId],
    references: [customers.id],
  }),
  connection: one(userConnections, {
    fields: [queryHistory.connectionId],
    references: [userConnections.id],
  }),
}))

export const dashboardsRelations = relations(dashboards, ({ one, many }) => ({
  customer: one(customers, {
    fields: [dashboards.customerId],
    references: [customers.id],
  }),
  connection: one(userConnections, {
    fields: [dashboards.connectionId],
    references: [userConnections.id],
  }),
  widgets: many(dashboardWidgets),
}))

export const dashboardWidgetsRelations = relations(dashboardWidgets, ({ one }) => ({
  dashboard: one(dashboards, {
    fields: [dashboardWidgets.dashboardId],
    references: [dashboards.id],
  }),
}))

// Inferred types
export type UserConnection = typeof userConnections.$inferSelect
export type NewUserConnection = typeof userConnections.$inferInsert
export type SavedQuery = typeof savedQueries.$inferSelect
export type NewSavedQuery = typeof savedQueries.$inferInsert
export type QueryHistoryEntry = typeof queryHistory.$inferSelect
export type NewQueryHistoryEntry = typeof queryHistory.$inferInsert
export type Dashboard = typeof dashboards.$inferSelect
export type NewDashboard = typeof dashboards.$inferInsert
export type DashboardWidget = typeof dashboardWidgets.$inferSelect
export type NewDashboardWidget = typeof dashboardWidgets.$inferInsert
export type UserSetting = typeof userSettings.$inferSelect
export type NewUserSetting = typeof userSettings.$inferInsert
export type UsageTrackingEntry = typeof usageTracking.$inferSelect
export type NewUsageTrackingEntry = typeof usageTracking.$inferInsert
