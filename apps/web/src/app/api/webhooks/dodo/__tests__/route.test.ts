// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { sendEmail, inserted, db } = vi.hoisted(() => {
  const inserted: { table: string; values: Record<string, unknown> }[] = [];

  function insertInto(table: { name: string }) {
    return {
      values(values: Record<string, unknown>) {
        inserted.push({ table: table.name, values });
        const rows = [{ id: `${table.name}-1`, ...values }];
        const result = Promise.resolve(rows);
        return Object.assign(result, {
          onConflictDoNothing: () => ({ returning: async () => rows }),
          returning: async () => rows,
        });
      },
    };
  }

  const db = {
    query: {
      webhookEvents: { findFirst: vi.fn(async () => undefined) },
      customers: { findFirst: vi.fn(async () => undefined) },
      licenses: { findFirst: vi.fn(async () => undefined) },
    },
    insert: vi.fn(insertInto),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
  };

  return { sendEmail: vi.fn(async () => ({ data: { id: "email-1" } })), inserted, db };
});

vi.mock("@/db", () => ({
  db,
  customers: { name: "customers" },
  licenses: { name: "licenses" },
  webhookEvents: { name: "webhookEvents" },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));

vi.mock("dodopayments", () => ({
  default: class {
    webhooks = { unwrap: (payload: string) => JSON.parse(payload) };
  },
}));

const DATA_PEEK_PRODUCT = "pdt_datapeek_pro";
const FLOAT_PRODUCT = "pdt_float_lifetime";

function paymentSucceeded(productId: string) {
  const body = JSON.stringify({
    business_id: "bus_1",
    timestamp: "2026-11-04T00:00:00Z",
    type: "payment.succeeded",
    data: {
      payment_id: `pay_${productId}`,
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: "buyer@example.com",
        name: "Buyer",
        customer_id: "cus_1",
      },
    },
  });
  return new NextRequest("http://localhost/api/webhooks/dodo", {
    method: "POST",
    body,
    headers: { "webhook-id": `msg_${productId}` },
  });
}

async function post(request: NextRequest) {
  const { POST } = await import("../route");
  return POST(request);
}

function licensesInserted() {
  return inserted.filter((row) => row.table === "licenses");
}

describe("POST /api/webhooks/dodo payment.succeeded", () => {
  beforeEach(() => {
    inserted.length = 0;
    sendEmail.mockClear();
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("DODO_PRO_PRODUCT_ID", DATA_PEEK_PRODUCT);
  });

  it("ignores a payment for another product on the same Dodo business", async () => {
    const response = await post(paymentSucceeded(FLOAT_PRODUCT));

    expect(response.status).toBe(200);
    expect(licensesInserted()).toHaveLength(0);
    expect(inserted.some((row) => row.table === "customers")).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("issues a license and emails it for a data-peek purchase", async () => {
    const response = await post(paymentSucceeded(DATA_PEEK_PRODUCT));

    expect(response.status).toBe(200);
    expect(licensesInserted()).toHaveLength(1);
    expect(licensesInserted()[0].values).toMatchObject({
      dodoPaymentId: `pay_${DATA_PEEK_PRODUCT}`,
      dodoProductId: DATA_PEEK_PRODUCT,
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "buyer@example.com" }),
    );
  });

  it("fails rather than issuing licenses when the product id is not configured", async () => {
    vi.stubEnv("DODO_PRO_PRODUCT_ID", "");

    const response = await post(paymentSucceeded(DATA_PEEK_PRODUCT));

    expect(response.status).toBe(500);
    expect(licensesInserted()).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
