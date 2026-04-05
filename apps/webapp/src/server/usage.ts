import { eq, and, sql } from 'drizzle-orm'
import { db } from '@/db'
import { usageTracking, licenses } from '@/db/schema'

export type Plan = 'free' | 'pro'

export interface PlanLimits {
  connections: number
  queriesPerDay: number
  savedQueries: number
  historyDays: number
  dashboards: number
  widgetsPerDashboard: number
  aiMessagesPerDay: number
}

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    connections: 2,
    queriesPerDay: 50,
    savedQueries: 10,
    historyDays: 7,
    dashboards: 1,
    widgetsPerDashboard: 4,
    aiMessagesPerDay: 10,
  },
  pro: {
    connections: Infinity,
    queriesPerDay: Infinity,
    savedQueries: Infinity,
    historyDays: 90,
    dashboards: Infinity,
    widgetsPerDashboard: Infinity,
    aiMessagesPerDay: Infinity,
  },
}

export function getLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan]
}

export async function getUserPlan(customerId: string): Promise<Plan> {
  const license = await db.query.licenses.findFirst({
    where: and(eq(licenses.customerId, customerId), eq(licenses.status, 'active')),
  })
  return license ? 'pro' : 'free'
}

export async function getTodayUsage(
  customerId: string
): Promise<{ queryCount: number; aiMessageCount: number }> {
  const today = new Date().toISOString().split('T')[0]

  const existing = await db.query.usageTracking.findFirst({
    where: and(eq(usageTracking.customerId, customerId), eq(usageTracking.date, today)),
  })

  return {
    queryCount: existing?.queryCount ?? 0,
    aiMessageCount: existing?.aiMessageCount ?? 0,
  }
}

export async function incrementUsage(
  customerId: string,
  field: 'queryCount' | 'aiMessageCount'
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]

  await db
    .insert(usageTracking)
    .values({
      customerId,
      date: today,
      queryCount: field === 'queryCount' ? 1 : 0,
      aiMessageCount: field === 'aiMessageCount' ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [usageTracking.customerId, usageTracking.date],
      set: {
        [field === 'queryCount' ? 'queryCount' : 'aiMessageCount']:
          sql`${field === 'queryCount' ? usageTracking.queryCount : usageTracking.aiMessageCount} + 1`,
      },
    })
}

export async function checkQueryLimit(
  customerId: string
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const plan = await getUserPlan(customerId)
  const limits = getLimits(plan)
  if (limits.queriesPerDay === Infinity) return { allowed: true, used: 0, limit: Infinity }

  const usage = await getTodayUsage(customerId)
  return {
    allowed: usage.queryCount < limits.queriesPerDay,
    used: usage.queryCount,
    limit: limits.queriesPerDay,
  }
}
