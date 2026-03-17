/**
 * Re-exports from desktop's main process code.
 *
 * Desktop modules are loaded as CJS by tsx (desktop has no "type": "module").
 * Node's ESM→CJS named export detection fails for tsx-transformed files,
 * so we use createRequire to load them as CJS and re-export for ESM consumers.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Database adapters (clean — no electron deps)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAdapter = require('../../desktop/src/main/db-adapter')
export const getAdapter: (config: any) => any = dbAdapter.getAdapter
export const getAdapterByType: (dbType: string) => any = dbAdapter.getAdapterByType

// SQL builder (clean)
const sqlBuilder = require('../../desktop/src/main/sql-builder')
export const buildQuery = sqlBuilder.buildQuery
export const validateOperation = sqlBuilder.validateOperation
export const buildPreviewSql = sqlBuilder.buildPreviewSql

// DDL builder (clean)
const ddlBuilder = require('../../desktop/src/main/ddl-builder')
export const buildCreateTable = ddlBuilder.buildCreateTable
export const buildAlterTable = ddlBuilder.buildAlterTable
export const buildDropTable = ddlBuilder.buildDropTable
export const buildPreviewDDL = ddlBuilder.buildPreviewDDL
export const validateTableDefinition = ddlBuilder.validateTableDefinition

// Query tracker (has logger — shimmed via cjs-shims.cjs)
const queryTracker = require('../../desktop/src/main/query-tracker')
export const cancelQuery = queryTracker.cancelQuery
export const registerQuery = queryTracker.registerQuery
export const unregisterQuery = queryTracker.unregisterQuery

// Telemetry collector (clean)
const telemetryMod = require('../../desktop/src/main/telemetry-collector')
export const telemetryCollector = telemetryMod.telemetryCollector

// Performance analyzer (has logger — shimmed)
const perfAnalyzer = require('../../desktop/src/main/performance-analyzer')
export const analyzeQueryPerformance = perfAnalyzer.analyzeQueryPerformance

// Scheduler service (has logger + electron.Notification — shimmed)
const scheduler = require('../../desktop/src/main/scheduler-service')
export const initSchedulerService = scheduler.initSchedulerService
export const stopAllSchedules = scheduler.stopAllSchedules
export const listScheduledQueries = scheduler.listScheduledQueries
export const getScheduledQuery = scheduler.getScheduledQuery
export const createScheduledQuery = scheduler.createScheduledQuery
export const updateScheduledQuery = scheduler.updateScheduledQuery
export const deleteScheduledQuery = scheduler.deleteScheduledQuery
export const pauseScheduledQuery = scheduler.pauseScheduledQuery
export const resumeScheduledQuery = scheduler.resumeScheduledQuery
export const runScheduledQueryNow = scheduler.runScheduledQueryNow
export const getScheduledQueryRuns = scheduler.getScheduledQueryRuns
export const getAllRecentRuns = scheduler.getAllRecentRuns
export const clearScheduledQueryRuns = scheduler.clearScheduledQueryRuns
export const validateCronExpression = scheduler.validateCronExpression
export const getNextRunTimes = scheduler.getNextRunTimes

// Dashboard service (has logger + electron.BrowserWindow — shimmed)
const dashboard = require('../../desktop/src/main/dashboard-service')
export const initDashboardService = dashboard.initDashboardService
export const listDashboards = dashboard.listDashboards
export const getDashboard = dashboard.getDashboard
export const createDashboard = dashboard.createDashboard
export const updateDashboard = dashboard.updateDashboard
export const deleteDashboard = dashboard.deleteDashboard
export const duplicateDashboard = dashboard.duplicateDashboard
export const addWidget = dashboard.addWidget
export const updateWidget = dashboard.updateWidget
export const deleteWidget = dashboard.deleteWidget
export const updateWidgetLayouts = dashboard.updateWidgetLayouts
export const executeWidget = dashboard.executeWidget
export const executeAllWidgets = dashboard.executeAllWidgets
export const getDashboardsByTag = dashboard.getDashboardsByTag
export const getAllDashboardTags = dashboard.getAllDashboardTags
export const updateDashboardRefreshSchedule = dashboard.updateDashboardRefreshSchedule
export const getNextRefreshTime = dashboard.getNextRefreshTime
// validateCronExpression already exported from scheduler (same implementation)
export const getNextRefreshTimes = dashboard.getNextRefreshTimes

// AI service (has logger — shimmed)
const aiService = require('../../desktop/src/main/ai-service')
export const initAIStore = aiService.initAIStore
export const getAIConfig = aiService.getAIConfig
export const setAIConfig = aiService.setAIConfig
export const clearAIConfig = aiService.clearAIConfig
export const validateAPIKey = aiService.validateAPIKey
export const generateChatResponse = aiService.generateChatResponse
export const getChatHistory = aiService.getChatHistory
export const saveChatHistory = aiService.saveChatHistory
export const clearChatHistory = aiService.clearChatHistory
export const getChatSessions = aiService.getChatSessions
export const getChatSession = aiService.getChatSession
export const createChatSession = aiService.createChatSession
export const updateChatSession = aiService.updateChatSession
export const deleteChatSession = aiService.deleteChatSession
export const getMultiProviderConfig = aiService.getMultiProviderConfig
export const setMultiProviderConfig = aiService.setMultiProviderConfig
export const getProviderConfig = aiService.getProviderConfig
export const setProviderConfig = aiService.setProviderConfig
export const removeProviderConfig = aiService.removeProviderConfig
export const setActiveProvider = aiService.setActiveProvider
export const setActiveModel = aiService.setActiveModel

// License service (has electron.app — shimmed)
const license = require('../../desktop/src/main/license-service')
export const initLicenseStore = license.initLicenseStore
export const checkLicense = license.checkLicense
export const activateLicense = license.activateLicense
export const deactivateLicense = license.deactivateLicense
export const activateLicenseOffline = license.activateLicenseOffline
