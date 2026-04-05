import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { createRouter, protectedProcedure } from '../trpc'
import { userConnections } from '@/db/schema'
import { getAdapter } from '@/lib/db-connect'

export const schemaRouter = createRouter({
  getSchemas: protectedProcedure
    .input(z.object({ connectionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const connection = await ctx.db.query.userConnections.findFirst({
        where: and(
          eq(userConnections.id, input.connectionId),
          eq(userConnections.customerId, ctx.customerId)
        ),
      })

      if (!connection) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Connection not found' })
      }

      const adapter = await getAdapter(
        connection.id,
        connection.dbType,
        connection.encryptedCredentials,
        connection.iv,
        connection.authTag,
        ctx.userId
      )

      return adapter.getSchemas()
    }),
})
