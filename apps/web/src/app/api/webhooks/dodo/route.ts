import { NextRequest, NextResponse } from "next/server";
import { db, customers, licenses, webhookEvents } from "@/db";
import { eq } from "drizzle-orm";
import { calculateUpdatesUntil, generateLicenseKey } from "@/lib/license";
import { Resend } from "resend";
import DodoPayments from "dodopayments";

const resend = new Resend(process.env.RESEND_API_KEY ?? "re_123");
const dodo = new DodoPayments({
  bearerToken: process.env.DODO_API_KEY,
  webhookKey: process.env.DODO_WEBHOOK_SECRET,
});

// DodoPayments webhook event types
type DodoEventType =
  | "payment.succeeded"
  | "payment.refunded"
  | "payment.failed"
  | "subscription.active"
  | "subscription.renewed"
  | "subscription.cancelled";

interface DodoWebhookPayload {
  business_id: string;
  timestamp: string;
  type: DodoEventType;
  data: {
    // Common fields
    payment_id?: string;
    subscription_id?: string;
    product_id?: string;
    customer?: {
      email: string;
      name?: string;
      customer_id: string;
    };
    metadata?: Record<string, string>;
    // Payment specific
    total_amount?: number;
    currency?: string;
    status?: string;
  };
}

// Helper to extract a unique event ID from the payload
function getEventId(event: DodoWebhookPayload): string {
  const { data, type, timestamp } = event;
  // Try various ID fields, fallback to type + timestamp
  return data.payment_id || data.subscription_id || `${type}-${timestamp}`;
}

// Send welcome email with license key
async function sendWelcomeEmail(
  email: string,
  name: string | undefined,
  licenseKey: string,
  updatesUntil: Date
) {
  console.log(`Attempting to send welcome email to: ${email}`);

  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return;
  }

  console.log(`RESEND_API_KEY is configured (length: ${process.env.RESEND_API_KEY.length})`);

  try {
    const result = await resend.emails.send({
      from: "data-peek <hello@send.datapeek.dev>",
      to: email,
      subject: "Your data-peek Pro license 🎉",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6b8cf5;">Welcome to data-peek Pro!</h1>

          <p>Hi ${name || "there"},</p>

          <p>Thank you for purchasing data-peek Pro! Your license is ready to use.</p>

          <div style="background: #111113; border: 1px solid #27272a; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <p style="color: #a1a1aa; margin: 0 0 8px 0; font-size: 14px;">Your License Key:</p>
            <p style="color: #fafafa; font-family: monospace; font-size: 18px; margin: 0; letter-spacing: 1px;">${licenseKey}</p>
          </div>

          <h3>Quick Start:</h3>
          <ol>
            <li>Download data-peek from <a href="https://datapeek.dev/download" style="color: #6b8cf5;">datapeek.dev/download</a></li>
            <li>Open the app and go to <strong>Settings → License</strong></li>
            <li>Enter your license key</li>
          </ol>

          <h3>Your license includes:</h3>
          <ul>
            <li>✓ 1 year of updates (until ${updatesUntil.toLocaleDateString()})</li>
            <li>✓ 3 device activations</li>
            <li>✓ All Pro features unlocked</li>
          </ul>

          <p>Need help? Just reply to this email.</p>

          <p>Happy querying!<br>— The data-peek team</p>
        </div>
      `,
    });
    console.log(`Welcome email sent successfully to ${email}. Resend ID: ${result.data?.id}`);
  } catch (error) {
    console.error("Failed to send welcome email:", error);
  }
}

export async function POST(request: NextRequest) {
  let webhookEventId: string | null = null;

  try {
    const payload = await request.text();

    // Extract Standard Webhooks headers
    const webhookHeaders = {
      "webhook-id": request.headers.get("webhook-id") ?? "",
      "webhook-signature": request.headers.get("webhook-signature") ?? "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    };

    let event: DodoWebhookPayload;

    // Verify signature using Dodo Payments SDK (follows Standard Webhooks spec)
    try {
      // unwrap() verifies the signature and returns the parsed payload
      const unwrapped = dodo.webhooks.unwrap(payload, { headers: webhookHeaders });
      event = unwrapped as unknown as DodoWebhookPayload;
    } catch (verifyError) {
      console.error("Webhook signature verification failed:", verifyError);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Use webhook-id header for idempotency (as per Standard Webhooks spec)
    // This prevents duplicate processing due to retries
    const webhookId = webhookHeaders["webhook-id"];
    const eventId = webhookId || getEventId(event);

    // Check if we've already processed this webhook (idempotency)
    const existingEvent = await db.query.webhookEvents.findFirst({
      where: eq(webhookEvents.eventId, eventId),
    });

    if (existingEvent?.processed) {
      console.log(`Webhook already processed: ${eventId}`);
      return NextResponse.json({ received: true });
    }

    // Save webhook event to database
    const [savedEvent] = await db
      .insert(webhookEvents)
      .values({
        eventId,
        eventName: event.type,
        provider: "dodo",
        payload: event,
        processed: false,
      })
      .onConflictDoNothing() // Handle race condition with duplicate webhook delivery
      .returning();

    // If no event was inserted (duplicate), return success
    if (!savedEvent) {
      console.log(`Duplicate webhook received: ${eventId}`);
      return NextResponse.json({ received: true });
    }

    webhookEventId = savedEvent.id;

    switch (event.type) {
      case "payment.succeeded": {
        const { data } = event;

        if (!data.customer) {
          console.log("No customer data in payment.succeeded event");
          break;
        }

        // Find or create customer
        let customer = await db.query.customers.findFirst({
          where: eq(customers.dodoCustomerId, data.customer.customer_id),
        });

        if (!customer) {
          // Try finding by email
          customer = await db.query.customers.findFirst({
            where: eq(customers.email, data.customer.email),
          });
        }

        if (!customer) {
          const [newCustomer] = await db
            .insert(customers)
            .values({
              email: data.customer.email,
              name: data.customer.name,
              dodoCustomerId: data.customer.customer_id,
            })
            .returning();
          customer = newCustomer;
          console.log(`Customer created: ${data.customer.email}`);
        } else if (!customer.dodoCustomerId) {
          // Update existing customer with DodoPayments ID
          await db
            .update(customers)
            .set({ dodoCustomerId: data.customer.customer_id })
            .where(eq(customers.id, customer.id));
          console.log(`Customer updated with Dodo ID: ${data.customer.email}`);
        } else {
          console.log(`Customer already exists: ${data.customer.email}`);
        }

        // Check if license already exists for this payment (idempotency)
        const existingLicense = await db.query.licenses.findFirst({
          where: eq(licenses.dodoPaymentId, data.payment_id || ""),
        });

        if (existingLicense) {
          console.log(`License already exists for payment ${data.payment_id}`);
          break;
        }

        // Generate license key and create license
        const licenseKey = generateLicenseKey("DPRO");
        const updatesUntil = calculateUpdatesUntil();

        await db.insert(licenses).values({
          customerId: customer.id,
          licenseKey,
          plan: "pro",
          status: "active",
          maxActivations: 3,
          dodoPaymentId: data.payment_id,
          dodoProductId: data.product_id,
          updatesUntil,
        });

        // Send welcome email with license key
        await sendWelcomeEmail(
          customer.email,
          customer.name || undefined,
          licenseKey,
          updatesUntil
        );

        console.log(`Payment succeeded for ${data.customer.email}: ${data.payment_id}, license: ${licenseKey}`);
        break;
      }

      case "payment.refunded": {
        const { data } = event;

        if (!data.payment_id) {
          console.log("No payment_id in payment.refunded event");
          break;
        }

        // Find and revoke the license
        const license = await db.query.licenses.findFirst({
          where: eq(licenses.dodoPaymentId, data.payment_id),
        });

        if (license) {
          await db
            .update(licenses)
            .set({ status: "revoked" })
            .where(eq(licenses.id, license.id));

          console.log(`License revoked for payment ${data.payment_id}`);
        }
        break;
      }

      case "payment.failed": {
        const { data } = event;
        console.log(`Payment failed: ${data.payment_id}`);
        // Could send a failed payment notification email here
        break;
      }

      case "subscription.active":
      case "subscription.renewed": {
        const { data } = event;
        console.log(`Subscription ${event.type}: ${data.subscription_id}`);
        // Handle subscription events if needed
        break;
      }

      case "subscription.cancelled": {
        const { data } = event;
        console.log(`Subscription cancelled: ${data.subscription_id}`);
        // Could revoke license or mark for expiration
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }

    // Mark event as processed
    if (webhookEventId) {
      await db
        .update(webhookEvents)
        .set({ processed: true, processedAt: new Date() })
        .where(eq(webhookEvents.id, webhookEventId));
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);

    // Update event with error if we have an ID
    if (webhookEventId) {
      await db
        .update(webhookEvents)
        .set({
          error: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(webhookEvents.id, webhookEventId));
    }

    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
