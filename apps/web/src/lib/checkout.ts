import type DodoPayments from "dodopayments";
import { BLACK_FRIDAY, saleIsLive } from "./sale";

export type CheckoutClient = {
  checkoutSessions: {
    create(
      body: DodoPayments.CheckoutSessionCreateParams,
    ): Promise<DodoPayments.CheckoutSessionResponse>;
  };
};

// Dodo answers a code it won't accept with an error such as
// INVALID_DISCOUNT_CODE or DISCOUNT_CODE_EXPIRED. The sale must never block a
// purchase, so any failure with the code retries once at full price.
export async function createCheckoutSession(
  client: CheckoutClient,
  params: DodoPayments.CheckoutSessionCreateParams,
  now: Date,
): Promise<DodoPayments.CheckoutSessionResponse> {
  if (!saleIsLive(now)) return client.checkoutSessions.create(params);

  try {
    return await client.checkoutSessions.create({
      ...params,
      discount_codes: [BLACK_FRIDAY.code],
    });
  } catch (error) {
    console.error(
      `Checkout with discount code ${BLACK_FRIDAY.code} failed, retrying without it:`,
      error,
    );
    return client.checkoutSessions.create(params);
  }
}
