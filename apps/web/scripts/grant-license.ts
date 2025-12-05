#!/usr/bin/env npx tsx
/**
 * Grant a free license to a contributor
 *
 * Usage:
 *   pnpm admin:grant-license --email contributor@example.com
 *   pnpm admin:grant-license --email contributor@example.com --name "John Doe"
 *   pnpm admin:grant-license --email contributor@example.com --plan team --years 2
 *
 * Options:
 *   --email    (required) Contributor's email address
 *   --name     (optional) Contributor's name
 *   --plan     (optional) License plan: pro, team, enterprise (default: pro)
 *   --years    (optional) License duration in years (default: 1)
 *   --reason   (optional) Reason for granting (stored in metadata)
 *   --dry-run  (optional) Preview without making changes
 */

import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq } from 'drizzle-orm'
import { Resend } from 'resend'
import { parseArgs } from 'util'
import { customers, licenses } from '../src/db/schema'
import { generateLicenseKey } from '../src/lib/license'

// Parse CLI arguments
const { values } = parseArgs({
  options: {
    email: { type: 'string', short: 'e' },
    name: { type: 'string', short: 'n' },
    plan: { type: 'string', short: 'p', default: 'pro' },
    years: { type: 'string', short: 'y', default: '1' },
    reason: { type: 'string', short: 'r', default: 'contributor' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

// Show help
if (values.help) {
  console.log(`
Grant a free license to a contributor

Usage:
  pnpm admin:grant-license --email <email> [options]

Options:
  -e, --email    (required) Contributor's email address
  -n, --name     (optional) Contributor's name
  -p, --plan     (optional) License plan: pro, team, enterprise (default: pro)
  -y, --years    (optional) License duration in years (default: 1)
  -r, --reason   (optional) Reason for granting (default: contributor)
      --dry-run  (optional) Preview without making changes
  -h, --help     Show this help message

Examples:
  pnpm admin:grant-license --email john@example.com
  pnpm admin:grant-license --email john@example.com --name "John Doe" --plan team
  pnpm admin:grant-license --email john@example.com --years 2 --reason "core contributor"
`)
  process.exit(0)
}

// Validate required arguments
if (!values.email) {
  console.error('Error: --email is required')
  console.error('Run with --help for usage information')
  process.exit(1)
}

const email = values.email
const name = values.name
const plan = values.plan as 'pro' | 'team' | 'enterprise'
const years = parseInt(values.years || '1', 10)
const reason = values.reason || 'contributor'
const isDryRun = values['dry-run']

// Validate plan
if (!['pro', 'team', 'enterprise'].includes(plan)) {
  console.error(`Error: Invalid plan "${plan}". Must be one of: pro, team, enterprise`)
  process.exit(1)
}

// Validate years
if (isNaN(years) || years < 1 || years > 10) {
  console.error('Error: --years must be a number between 1 and 10')
  process.exit(1)
}

// Get plan prefix for license key
function getPlanPrefix(plan: string): string {
  switch (plan) {
    case 'team':
      return 'DTEAM'
    case 'enterprise':
      return 'DENT'
    default:
      return 'DPRO'
  }
}

// Calculate expiration date
function calculateUpdatesUntil(years: number): Date {
  const expiry = new Date()
  expiry.setFullYear(expiry.getFullYear() + years)
  return expiry
}

// Send license email
async function sendLicenseEmail(
  resend: Resend,
  email: string,
  name: string | undefined,
  licenseKey: string,
  plan: string,
  updatesUntil: Date,
  reason: string
) {
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1)

  const result = await resend.emails.send({
    from: 'data-peek <hello@send.datapeek.dev>',
    to: email,
    subject: `Your data-peek ${planLabel} license - Thank you for contributing!`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #22d3ee;">Thank you for contributing to data-peek!</h1>

        <p>Hi ${name || 'there'},</p>

        <p>As a token of our appreciation for your contribution, we're giving you a free data-peek ${planLabel} license.</p>

        <div style="background: #111113; border: 1px solid #27272a; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <p style="color: #a1a1aa; margin: 0 0 8px 0; font-size: 14px;">Your License Key:</p>
          <p style="color: #fafafa; font-family: monospace; font-size: 18px; margin: 0; letter-spacing: 1px;">${licenseKey}</p>
        </div>

        <h3>Quick Start:</h3>
        <ol>
          <li>Download data-peek from <a href="https://www.datapeek.dev/download?utm_source=email&utm_medium=license&utm_content=contributor" style="color: #22d3ee;">datapeek.dev/download</a></li>
          <li>Open the app and go to <strong>Settings → License</strong></li>
          <li>Enter your license key</li>
        </ol>

        <h3>Your license includes:</h3>
        <ul>
          <li>✓ ${years} year${years > 1 ? 's' : ''} of updates (until ${updatesUntil.toLocaleDateString()})</li>
          <li>✓ ${plan === 'team' ? '10' : plan === 'enterprise' ? 'Unlimited' : '3'} device activations</li>
          <li>✓ All ${planLabel} features unlocked</li>
        </ul>

        <p style="color: #a1a1aa; font-size: 14px; margin-top: 24px;">
          This license was granted for: <em>${reason}</em>
        </p>

        <p>Need help? Just reply to this email.</p>

        <p>Happy querying!<br>— Rohith from data-peek</p>
      </div>
    `,
  })

  return result
}

async function main() {
  console.log('\n' + '='.repeat(50))
  console.log('  Grant Contributor License')
  console.log('='.repeat(50))
  console.log(`
  Email:    ${email}
  Name:     ${name || '(not provided)'}
  Plan:     ${plan}
  Duration: ${years} year${years > 1 ? 's' : ''}
  Reason:   ${reason}
  Dry Run:  ${isDryRun ? 'Yes' : 'No'}
`)

  if (isDryRun) {
    console.log('[DRY RUN] Would perform the following actions:')
    console.log(`  1. Find or create customer with email: ${email}`)
    console.log(`  2. Generate ${plan} license key`)
    console.log(`  3. Insert license into database`)
    console.log(`  4. Send license email to ${email}`)
    console.log('\nNo changes made.')
    process.exit(0)
  }

  // Validate environment
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL environment variable is not set')
    console.error('Make sure you have a .env file with DATABASE_URL')
    process.exit(1)
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('Error: RESEND_API_KEY environment variable is not set')
    console.error('Make sure you have a .env file with RESEND_API_KEY')
    process.exit(1)
  }

  // Initialize database
  const client = postgres(process.env.DATABASE_URL, { max: 1 })
  const db = drizzle(client)

  // Initialize Resend
  const resend = new Resend(process.env.RESEND_API_KEY)

  try {
    // 1. Find or create customer
    console.log('Finding or creating customer...')
    let customer = await db.select().from(customers).where(eq(customers.email, email)).limit(1)

    if (customer.length === 0) {
      console.log('  Customer not found, creating...')
      const [newCustomer] = await db
        .insert(customers)
        .values({
          email,
          name: name || null,
        })
        .returning()
      customer = [newCustomer]
      console.log(`  Created customer: ${newCustomer.id}`)
    } else {
      console.log(`  Found existing customer: ${customer[0].id}`)
      // Update name if provided and different
      if (name && customer[0].name !== name) {
        await db.update(customers).set({ name }).where(eq(customers.id, customer[0].id))
        console.log('  Updated customer name')
      }
    }

    // 2. Check for existing active license
    const existingLicense = await db
      .select()
      .from(licenses)
      .where(eq(licenses.customerId, customer[0].id))
      .limit(1)

    if (existingLicense.length > 0 && existingLicense[0].status === 'active') {
      console.log('\n  Warning: Customer already has an active license!')
      console.log(`  Existing key: ${existingLicense[0].licenseKey}`)
      console.log(`  Expires: ${existingLicense[0].updatesUntil.toLocaleDateString()}`)
      console.log('\n  Creating new license anyway...')
    }

    // 3. Generate license
    console.log('Generating license key...')
    const licenseKey = generateLicenseKey(getPlanPrefix(plan))
    const updatesUntil = calculateUpdatesUntil(years)
    console.log(`  License key: ${licenseKey}`)
    console.log(`  Valid until: ${updatesUntil.toLocaleDateString()}`)

    // 4. Insert license
    console.log('Saving license to database...')
    const maxActivations = plan === 'team' ? 10 : plan === 'enterprise' ? 100 : 3

    const [newLicense] = await db
      .insert(licenses)
      .values({
        customerId: customer[0].id,
        licenseKey,
        plan,
        status: 'active',
        maxActivations,
        dodoPaymentId: `contributor-${Date.now()}`, // Mark as contributor license
        dodoProductId: null,
        updatesUntil,
      })
      .returning()

    console.log(`  License saved: ${newLicense.id}`)

    // 5. Send email
    console.log('Sending license email...')
    const emailResult = await sendLicenseEmail(
      resend,
      email,
      name,
      licenseKey,
      plan,
      updatesUntil,
      reason
    )

    if (emailResult.error) {
      console.error('  Failed to send email:', emailResult.error)
    } else {
      console.log(`  Email sent! ID: ${emailResult.data?.id}`)
    }

    // Done!
    console.log('\n' + '='.repeat(50))
    console.log('  License granted successfully!')
    console.log('='.repeat(50))
    console.log(`
  License Key: ${licenseKey}
  Email:       ${email}
  Plan:        ${plan}
  Expires:     ${updatesUntil.toLocaleDateString()}
`)
  } catch (error) {
    console.error('\nError:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
