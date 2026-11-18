import { afterEach, describe, expect, it, vi } from "vitest";
import DodoPayments from "dodopayments";
import { createCheckoutSession, type CheckoutClient } from "../checkout";

function rejection(status: number, code: string) {
  return new DodoPayments.APIError(status, { code }, code, undefined);
}

const params: DodoPayments.CheckoutSessionCreateParams = {
  product_cart: [{ product_id: "prd_test", quantity: 1 }],
};
const session = { session_id: "cks_1", checkout_url: "https://pay/cks_1" };
const duringSale = new Date("2026-11-27T12:00:00Z");
const beforeSale = new Date("2026-11-10T12:00:00Z");

function fakeClient(
  ...outcomes: Array<"ok" | Error>
): CheckoutClient & { calls: DodoPayments.CheckoutSessionCreateParams[] } {
  const calls: DodoPayments.CheckoutSessionCreateParams[] = [];
  return {
    calls,
    checkoutSessions: {
      async create(body) {
        calls.push(body);
        const outcome = outcomes[calls.length - 1];
        if (outcome instanceof Error) throw outcome;
        return session;
      },
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("createCheckoutSession", () => {
  it("does not send a discount code outside the sale window", async () => {
    const client = fakeClient("ok");
    await expect(
      createCheckoutSession(client, params, beforeSale),
    ).resolves.toBe(session);
    expect(client.calls).toEqual([params]);
  });

  it("pre-applies the Black Friday code during the sale", async () => {
    const client = fakeClient("ok");
    await expect(
      createCheckoutSession(client, params, duringSale),
    ).resolves.toBe(session);
    expect(client.calls).toEqual([{ ...params, discount_codes: ["BF26PEEK"] }]);
  });

  it("retries once without the code when Dodo rejects it, and logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const rejected = rejection(422, "INVALID_DISCOUNT_CODE");
    const client = fakeClient(rejected, "ok");

    await expect(
      createCheckoutSession(client, params, duringSale),
    ).resolves.toBe(session);
    expect(client.calls).toEqual([
      { ...params, discount_codes: ["BF26PEEK"] },
      params,
    ]);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("BF26PEEK"),
      rejected,
    );
  });

  it("surfaces the full-price error when the retry also fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const down = new Error("service unavailable");
    const client = fakeClient(rejection(400, "DISCOUNT_CODE_EXPIRED"), down);

    await expect(
      createCheckoutSession(client, params, duringSale),
    ).rejects.toBe(down);
    expect(client.calls).toHaveLength(2);
  });

  it.each([
    ["a Dodo outage", () => rejection(503, "SERVICE_UNAVAILABLE")],
    ["a network failure", () => new Error("fetch failed")],
  ])(
    "does not drop the code on %s, so nobody is quietly charged full price",
    async (_, makeError) => {
      const error = makeError();
      const client = fakeClient(error, "ok");

      await expect(
        createCheckoutSession(client, params, duringSale),
      ).rejects.toBe(error);
      expect(client.calls).toEqual([
        { ...params, discount_codes: ["BF26PEEK"] },
      ]);
    },
  );
});
