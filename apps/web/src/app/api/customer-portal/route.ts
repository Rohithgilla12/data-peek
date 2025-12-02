import { db, licenses } from "@/db";
import DodoPayments from "dodopayments";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const dodo = new DodoPayments({ bearerToken: process.env.DODO_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { license_key: rawLicenseKey } = body as { license_key: string };

    // Normalize license key to uppercase
    const license_key = rawLicenseKey?.toUpperCase().trim();

    if (!license_key) {
      return NextResponse.json(
        { success: false, error: "License key is required" },
        { status: 400 }
      );
    }

    // Find license and associated customer
    const license = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, license_key),
      with: {
        customer: true,
      },
    });

    if (!license) {
      return NextResponse.json(
        { success: false, error: "License key not found" },
        { status: 404 }
      );
    }

    if (!license.customer?.dodoCustomerId) {
      return NextResponse.json(
        {
          success: false,
          error: "Customer not found or not linked to payment provider",
        },
        { status: 404 }
      );
    }

    // Create customer portal session via Dodo Payments
    const portalSession = await dodo.customers.customerPortal.create(
      license.customer.dodoCustomerId
    );

    return NextResponse.json({
      success: true,
      link: portalSession.link,
    });
  } catch (error) {
    console.error("Customer portal error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create customer portal session" },
      { status: 500 }
    );
  }
}
