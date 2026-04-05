import { createRouter, protectedProcedure } from "../trpc";
import { getUserPlan, getTodayUsage, getLimits } from "../usage";
import { eq, count } from "drizzle-orm";
import { userConnections, savedQueries, dashboards } from "@/db/schema";

export const usageRouter = createRouter({
  current: protectedProcedure.query(async ({ ctx }) => {
    const plan = await getUserPlan(ctx.customerId);
    const limits = getLimits(plan);
    const todayUsage = await getTodayUsage(ctx.customerId);

    const [connectionResult] = await ctx.db
      .select({ count: count() })
      .from(userConnections)
      .where(eq(userConnections.customerId, ctx.customerId));

    const [savedQueryResult] = await ctx.db
      .select({ count: count() })
      .from(savedQueries)
      .where(eq(savedQueries.customerId, ctx.customerId));

    const [dashboardResult] = await ctx.db
      .select({ count: count() })
      .from(dashboards)
      .where(eq(dashboards.customerId, ctx.customerId));

    return {
      plan,
      limits,
      usage: {
        queriesUsed: todayUsage.queryCount,
        aiMessagesUsed: todayUsage.aiMessageCount,
        connectionsUsed: connectionResult.count,
        savedQueriesUsed: savedQueryResult.count,
        dashboardsUsed: dashboardResult.count,
      },
    };
  }),
});
