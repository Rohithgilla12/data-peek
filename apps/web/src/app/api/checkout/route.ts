import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";

const client = new DodoPayments({
  bearerToken: process.env.DODO_API_KEY,
  environment:
    process.env.NODE_ENV === "production" ? "live_mode" : "test_mode",
});

// Product ID for data-peek Pro license
const PRO_LICENSE_PRODUCT_ID = process.env.DODO_PRO_PRODUCT_ID || "prd_xxx";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, name } = body as { email?: string; name?: string };

    const checkoutSession = await client.checkoutSessions.create({
      product_cart: [
        {
          product_id: PRO_LICENSE_PRODUCT_ID,
          quantity: 1,
        },
      ],
      ...(email && {
        customer: {
          email,
          ...(name && { name }),
        },
      }),
      billing_currency: "USD",
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://datapeek.dev"}/download?purchase=success`,
      metadata: {
        source: "website",
        plan: "pro",
      },
    });

    return NextResponse.json({
      checkout_url: checkoutSession.checkout_url,
      session_id: checkoutSession.session_id,
    });
  } catch (error) {
    console.error("Checkout session creation failed:", error);

    if (error instanceof DodoPayments.APIError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status || 500 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
