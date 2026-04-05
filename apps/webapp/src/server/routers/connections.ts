import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, protectedProcedure } from "../trpc";
import { userConnections } from "@/db/schema";
import { encryptCredentials, decryptCredentials } from "@/lib/encryption";

const connectionInput = z.object({
  name: z.string().min(1).max(100),
  dbType: z.enum(["postgresql", "mysql"]),
  environment: z
    .enum(["production", "staging", "development", "local"])
    .default("development"),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1),
  user: z.string().min(1),
  password: z.string(),
  sslEnabled: z.boolean().default(false),
});

export const connectionsRouter = createRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const connections = await ctx.db.query.userConnections.findMany({
      where: eq(userConnections.customerId, ctx.customerId),
      orderBy: (uc, { desc }) => [desc(uc.updatedAt)],
    });

    return connections.map((c) => ({
      id: c.id,
      name: c.name,
      dbType: c.dbType,
      environment: c.environment,
      sslEnabled: c.sslEnabled,
      lastConnectedAt: c.lastConnectedAt,
      createdAt: c.createdAt,
    }));
  }),

  create: protectedProcedure
    .input(connectionInput)
    .mutation(async ({ ctx, input }) => {
      const { name, dbType, environment, sslEnabled, ...credentials } = input;

      const { encrypted, iv, authTag } = encryptCredentials(
        credentials,
        ctx.userId,
      );

      const [connection] = await ctx.db
        .insert(userConnections)
        .values({
          customerId: ctx.customerId,
          name,
          dbType,
          environment,
          sslEnabled,
          encryptedCredentials: encrypted,
          iv,
          authTag,
        })
        .returning({
          id: userConnections.id,
          name: userConnections.name,
          dbType: userConnections.dbType,
          environment: userConnections.environment,
          sslEnabled: userConnections.sslEnabled,
          createdAt: userConnections.createdAt,
        });

      return connection;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(connectionInput))
    .mutation(async ({ ctx, input }) => {
      const { id, name, dbType, environment, sslEnabled, ...credentials } =
        input;

      const existing = await ctx.db.query.userConnections.findFirst({
        where: and(
          eq(userConnections.id, id),
          eq(userConnections.customerId, ctx.customerId),
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Connection not found",
        });
      }

      const { encrypted, iv, authTag } = encryptCredentials(
        credentials,
        ctx.userId,
      );

      const [updated] = await ctx.db
        .update(userConnections)
        .set({
          name,
          dbType,
          environment,
          sslEnabled,
          encryptedCredentials: encrypted,
          iv,
          authTag,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userConnections.id, id),
            eq(userConnections.customerId, ctx.customerId),
          ),
        )
        .returning({
          id: userConnections.id,
          name: userConnections.name,
          dbType: userConnections.dbType,
          environment: userConnections.environment,
          sslEnabled: userConnections.sslEnabled,
        });

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.userConnections.findFirst({
        where: and(
          eq(userConnections.id, input.id),
          eq(userConnections.customerId, ctx.customerId),
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Connection not found",
        });
      }

      await ctx.db
        .delete(userConnections)
        .where(
          and(
            eq(userConnections.id, input.id),
            eq(userConnections.customerId, ctx.customerId),
          ),
        );

      return { success: true };
    }),

  test: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const connection = await ctx.db.query.userConnections.findFirst({
        where: and(
          eq(userConnections.id, input.id),
          eq(userConnections.customerId, ctx.customerId),
        ),
      });

      if (!connection) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Connection not found",
        });
      }

      const credentials = decryptCredentials(
        connection.encryptedCredentials,
        connection.iv,
        connection.authTag,
        ctx.userId,
      ) as {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
      };

      try {
        if (connection.dbType === "postgresql") {
          const { default: pg } = await import("pg");
          const client = new pg.Client({
            host: credentials.host,
            port: credentials.port,
            database: credentials.database,
            user: credentials.user,
            password: credentials.password,
            ssl: connection.sslEnabled
              ? { rejectUnauthorized: false }
              : undefined,
            connectionTimeoutMillis: 10000,
          });
          await client.connect();
          await client.query("SELECT 1");
          await client.end();
        } else if (connection.dbType === "mysql") {
          const mysql = await import("mysql2/promise");
          const conn = await mysql.createConnection({
            host: credentials.host,
            port: credentials.port,
            database: credentials.database,
            user: credentials.user,
            password: credentials.password,
            ssl: connection.sslEnabled
              ? { rejectUnauthorized: false }
              : undefined,
            connectTimeout: 10000,
          });
          await conn.query("SELECT 1");
          await conn.end();
        }

        await ctx.db
          .update(userConnections)
          .set({ lastConnectedAt: new Date() })
          .where(eq(userConnections.id, input.id));

        return { success: true, message: "Connection successful" };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Connection failed";
        return { success: false, message };
      }
    }),
});
