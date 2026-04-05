import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "@/db";
import { customers } from "@/db/schema";

export async function createTRPCContext() {
  const { userId } = await auth();

  return {
    db,
    userId,
  };
}

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createRouter = t.router;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }

  let customer = await ctx.db.query.customers.findFirst({
    where: eq(customers.clerkUserId, ctx.userId),
  });

  if (!customer) {
    const [newCustomer] = await ctx.db
      .insert(customers)
      .values({
        clerkUserId: ctx.userId,
        email: `${ctx.userId}@placeholder.local`,
      })
      .onConflictDoNothing()
      .returning();

    customer =
      newCustomer ??
      (await ctx.db.query.customers.findFirst({
        where: eq(customers.clerkUserId, ctx.userId),
      }));
  }

  if (!customer) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to resolve customer",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      customerId: customer.id,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
