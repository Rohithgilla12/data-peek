import { z } from 'zod'
import { eq, and, desc, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { createRouter, protectedProcedure } from '../trpc'
import { savedQueries } from '@/db/schema'

export const savedQueriesRouter = createRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          connectionId: z.string().uuid().optional(),
          search: z.string().optional(),
          updatedSince: z.string().datetime().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(savedQueries.customerId, ctx.customerId)]
      if (input?.connectionId) conditions.push(eq(savedQueries.connectionId, input.connectionId))
      if (input?.updatedSince) {
        conditions.push(
          sql`${savedQueries.updatedAt} > ${new Date(input.updatedSince)}`
        )
      }

      const results = await ctx.db.query.savedQueries.findMany({
        where: and(...conditions),
        orderBy: [desc(savedQueries.updatedAt)],
      })

      if (input?.search) {
        const term = input.search.toLowerCase()
        return results.filter(
          (q) => q.name.toLowerCase().includes(term) || q.query.toLowerCase().includes(term)
        )
      }
      return results
    }),

  create: protectedProcedure
    .input(
      z.object({
        connectionId: z.string().uuid(),
        name: z.string().min(1).max(200),
        query: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [saved] = await ctx.db
        .insert(savedQueries)
        .values({
          customerId: ctx.customerId,
          ...input,
        })
        .returning()
      return saved
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        query: z.string().min(1).optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input
      const existing = await ctx.db.query.savedQueries.findFirst({
        where: and(eq(savedQueries.id, id), eq(savedQueries.customerId, ctx.customerId)),
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })

      const [updated] = await ctx.db
        .update(savedQueries)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(savedQueries.id, id), eq(savedQueries.customerId, ctx.customerId)))
        .returning()
      return updated
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(savedQueries)
        .where(and(eq(savedQueries.id, input.id), eq(savedQueries.customerId, ctx.customerId)))
      return { success: true }
    }),

  incrementUsage: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(savedQueries)
        .set({ usageCount: sql`${savedQueries.usageCount} + 1`, updatedAt: new Date() })
        .where(and(eq(savedQueries.id, input.id), eq(savedQueries.customerId, ctx.customerId)))
        .returning({ id: savedQueries.id })

      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }

      return { success: true }
    }),

  bulkUpsert: protectedProcedure
    .input(
      z.object({
        upserts: z.array(
          z.object({
            id: z.string().uuid(),
            connectionId: z.string().uuid(),
            name: z.string().min(1).max(200),
            query: z.string().min(1),
            description: z.string().optional(),
            category: z.string().optional(),
            tags: z.array(z.string()).optional(),
            usageCount: z.number().int().default(0),
          })
        ),
        deletes: z.array(z.string().uuid()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results = []

      for (const item of input.upserts) {
        const existing = await ctx.db.query.savedQueries.findFirst({
          where: and(eq(savedQueries.id, item.id), eq(savedQueries.customerId, ctx.customerId)),
        })

        if (existing) {
          const [updated] = await ctx.db
            .update(savedQueries)
            .set({ ...item, updatedAt: new Date() })
            .where(and(eq(savedQueries.id, item.id), eq(savedQueries.customerId, ctx.customerId)))
            .returning()
          results.push(updated)
        } else {
          const [created] = await ctx.db
            .insert(savedQueries)
            .values({ ...item, customerId: ctx.customerId })
            .returning()
          results.push(created)
        }
      }

      for (const id of input.deletes) {
        await ctx.db
          .delete(savedQueries)
          .where(and(eq(savedQueries.id, id), eq(savedQueries.customerId, ctx.customerId)))
      }

      return { upserted: results, deleted: input.deletes.length }
    }),
})
