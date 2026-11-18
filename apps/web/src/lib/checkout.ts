import DodoPayments from "dodopayments";
import { BLACK_FRIDAY, saleIsLive } from "./sale";

export type CheckoutClient = {
  checkoutSessions: {
    create(
      body: DodoPayments.CheckoutSessionCreateParams,
    ): Promise<DodoPayments.CheckoutSessionResponse>;
  };
};

// Dodo answers a code it won't accept with a 4xx such as INVALID_DISCOUNT_CODE
// or DISCOUNT_CODE_EXPIRED, and the sale must never block a purchase, so those
// retry once at full price. Outages and network errors are rethrown instead:
// falling back on them would quietly charge list price to a buyer promised the
// sale price.
function isRejectedRequest(error: unknown): boolean {
  return (
    error instanceof DodoPayments.APIError &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
  );
}

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
    if (!isRejectedRequest(error)) throw error;
    console.error(
      `Checkout with discount code ${BLACK_FRIDAY.code} failed, retrying without it:`,
      error,
    );
    return client.checkoutSessions.create(params);
  }
}
