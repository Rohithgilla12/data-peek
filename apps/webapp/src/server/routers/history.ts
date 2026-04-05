import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { createRouter, protectedProcedure } from '../trpc'
import { queryHistory } from '@/db/schema'

export const historyRouter = createRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          connectionId: z.string().uuid().optional(),
          status: z.enum(['success', 'error']).optional(),
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(queryHistory.customerId, ctx.customerId)]
      if (input?.connectionId) conditions.push(eq(queryHistory.connectionId, input.connectionId))
      if (input?.status) conditions.push(eq(queryHistory.status, input.status))

      const results = await ctx.db.query.queryHistory.findMany({
        where: and(...conditions),
        orderBy: [desc(queryHistory.executedAt)],
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      })

      return results
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(queryHistory)
        .where(and(eq(queryHistory.id, input.id), eq(queryHistory.customerId, ctx.customerId)))
      return { success: true }
    }),

  clearAll: protectedProcedure
    .input(z.object({ connectionId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const conditions = [eq(queryHistory.customerId, ctx.customerId)]
      if (input?.connectionId) conditions.push(eq(queryHistory.connectionId, input.connectionId))

      await ctx.db.delete(queryHistory).where(and(...conditions))
      return { success: true }
    }),
})
