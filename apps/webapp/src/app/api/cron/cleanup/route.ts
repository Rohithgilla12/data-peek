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

    // Delete history older than 7 days for free users first
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
      const { rowCount } = await db
        .delete(queryHistory)
        .where(inArray(queryHistory.id, freeHistoryIds));
      freeDeleted = rowCount ?? 0;
    }

    // Delete history older than 90 days for all users (even Pro)
    const { rowCount: proDeleted } = await db
      .delete(queryHistory)
      .where(lt(queryHistory.executedAt, ninetyDaysAgo));

    return NextResponse.json({
      success: true,
      deleted: { proExpired: proDeleted ?? 0, freeExpired: freeDeleted },
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
