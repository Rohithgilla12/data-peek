import { NextRequest, NextResponse } from "next/server";
import { lt, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { queryHistory, licenses } from "@/db/schema";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const proCustomers = await db.query.licenses.findMany({
      where: eq(licenses.status, "active"),
      columns: { customerId: true },
    });
    const proCustomerIds = new Set(proCustomers.map((l) => l.customerId));

    const allFreeHistory = await db.query.queryHistory.findMany({
      where: lt(queryHistory.executedAt, sevenDaysAgo),
      columns: { id: true, customerId: true },
    });

    const freeHistoryIds = allFreeHistory
      .filter((h) => !proCustomerIds.has(h.customerId))
      .map((h) => h.id);

    let freeDeleted = 0;
    if (freeHistoryIds.length > 0) {
      const deleted = await db
        .delete(queryHistory)
        .where(inArray(queryHistory.id, freeHistoryIds))
        .returning({ id: queryHistory.id });
      freeDeleted = deleted.length;
    }

    const proExpiredDeleted = await db
      .delete(queryHistory)
      .where(lt(queryHistory.executedAt, ninetyDaysAgo))
      .returning({ id: queryHistory.id });

    return NextResponse.json({
      success: true,
      deleted: { proExpired: proExpiredDeleted.length, freeExpired: freeDeleted },
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Cron cleanup failed", { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
