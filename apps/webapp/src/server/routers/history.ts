import { z } from 'zod'
import { eq, and, desc, sql } from 'drizzle-orm'
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
          executedSince: z.string().datetime().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(queryHistory.customerId, ctx.customerId)]
      if (input?.connectionId) conditions.push(eq(queryHistory.connectionId, input.connectionId))
      if (input?.status) conditions.push(eq(queryHistory.status, input.status))
      if (input?.executedSince) {
        conditions.push(
          sql`${queryHistory.executedAt} > ${new Date(input.executedSince)}`
        )
      }

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

  bulkCreate: protectedProcedure
    .input(
      z.object({
        entries: z.array(
          z.object({
            id: z.string().uuid(),
            connectionId: z.string().uuid(),
            query: z.string(),
            status: z.enum(['success', 'error']),
            durationMs: z.number().int().optional(),
            rowCount: z.number().int().optional(),
            errorMessage: z.string().optional(),
            executedAt: z.string().datetime(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.entries.length === 0) return { created: 0 }

      const values = input.entries.map((e) => ({
        ...e,
        customerId: ctx.customerId,
        executedAt: new Date(e.executedAt),
      }))

      await ctx.db.insert(queryHistory).values(values).onConflictDoNothing()
      return { created: values.length }
    }),
})
