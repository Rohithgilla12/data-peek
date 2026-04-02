#!/usr/bin/env npx tsx
/**
 * Grant a free license to an educator
 *
 * Usage:
 *   pnpm admin:grant-educator --email educator@university.edu --institution "MIT"
 *   pnpm admin:grant-educator --email teacher@school.edu --name "Jane Doe" --institution "Stanford"
 *   pnpm admin:grant-educator --email prof@college.edu --plan team --years 2 --institution "Harvard"
 *
 * Options:
 *   --email       (required) Educator's email address
 *   --institution (required) Name of educational institution
 *   --name        (optional) Educator's name
 *   --plan        (optional) License plan: pro, team, enterprise (default: pro)
 *   --years       (optional) License duration in years (default: 2)
 *   --dry-run     (optional) Preview without making changes
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
    institution: { type: 'string', short: 'i' },
    plan: { type: 'string', short: 'p', default: 'pro' },
    years: { type: 'string', short: 'y', default: '2' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

// Show help
if (values.help) {
  console.log(`
Grant a free license to an educator

Usage:
  pnpm admin:grant-educator --email <email> --institution <institution> [options]

Options:
  -e, --email       (required) Educator's email address
  -i, --institution (required) Name of educational institution
  -n, --name        (optional) Educator's name
  -p, --plan        (optional) License plan: pro, team, enterprise (default: pro)
  -y, --years       (optional) License duration in years (default: 2)
      --dry-run     (optional) Preview without making changes
  -h, --help        Show this help message

Examples:
  pnpm admin:grant-educator --email professor@university.edu --institution "MIT"
  pnpm admin:grant-educator --email teacher@school.edu --name "Jane Doe" --institution "Stanford" --plan team
  pnpm admin:grant-educator --email prof@college.edu --years 3 --institution "Harvard"
`)
  process.exit(0)
}

// Validate required arguments
if (!values.email) {
  console.error('Error: --email is required')
  console.error('Run with --help for usage information')
  process.exit(1)
}

if (!values.institution) {
  console.error('Error: --institution is required')
  console.error('Run with --help for usage information')
  process.exit(1)
}

const email = values.email
const name = values.name
const institution = values.institution
const plan = values.plan as 'pro' | 'team' | 'enterprise'
const years = parseInt(values.years || '2', 10)
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
async function sendEducatorLicenseEmail(
  resend: Resend,
  email: string,
  name: string | undefined,
  institution: string,
  licenseKey: string,
  plan: string,
  updatesUntil: Date,
  years: number
) {
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1)

  const result = await resend.emails.send({
    from: 'data-peek <hello@send.datapeek.dev>',
    to: email,
    subject: `Your data-peek ${planLabel} educator license`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6b8cf5;">Welcome to the data-peek Educator Program!</h1>

        <p>Hi ${name || 'there'},</p>

        <p>We're excited to support your teaching at <strong>${institution}</strong> with a free data-peek ${planLabel} license.</p>

        <p>We believe that educators deserve the best tools to teach the next generation of database professionals, and we're honored to be part of your classroom.</p>

        <div style="background: #111113; border: 1px solid #27272a; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <p style="color: #a1a1aa; margin: 0 0 8px 0; font-size: 14px;">Your License Key:</p>
          <p style="color: #fafafa; font-family: monospace; font-size: 18px; margin: 0; letter-spacing: 1px;">${licenseKey}</p>
        </div>

        <h3>Quick Start:</h3>
        <ol>
          <li>Download data-peek from <a href="https://www.datapeek.dev/download?utm_source=email&utm_medium=license&utm_content=educator" style="color: #6b8cf5;">datapeek.dev/download</a></li>
          <li>Open the app and go to <strong>Settings → License</strong></li>
          <li>Enter your license key</li>
        </ol>

        <h3>Your educator license includes:</h3>
        <ul>
          <li>✓ ${years} year${years > 1 ? 's' : ''} of updates (until ${updatesUntil.toLocaleDateString()})</li>
          <li>✓ ${plan === 'team' ? '10' : plan === 'enterprise' ? 'Unlimited' : '3'} device activations</li>
          <li>✓ All ${planLabel} features unlocked</li>
        </ul>

        <div style="background: #18181b; border-left: 4px solid #6b8cf5; padding: 16px; margin: 24px 0;">
          <p style="margin: 0; color: #e4e4e7;">
            <strong>Tip for educators:</strong> If you need licenses for your students, reach out and we'll be happy to discuss our student program!
          </p>
        </div>

        <p>Need help? Just reply to this email.</p>

        <p>Happy teaching!<br>— Rohith from data-peek</p>
      </div>
    `,
  })

  return result
}

async function main() {
  console.log('\n' + '='.repeat(50))
  console.log('  Grant Educator License')
  console.log('='.repeat(50))
  console.log(`
  Email:       ${email}
  Name:        ${name || '(not provided)'}
  Institution: ${institution}
  Plan:        ${plan}
  Duration:    ${years} year${years > 1 ? 's' : ''}
  Dry Run:     ${isDryRun ? 'Yes' : 'No'}
`)

  if (isDryRun) {
    console.log('[DRY RUN] Would perform the following actions:')
    console.log(`  1. Find or create customer with email: ${email}`)
    console.log(`  2. Generate ${plan} license key`)
    console.log(`  3. Insert license into database (marked as educator from ${institution})`)
    console.log(`  4. Send educator license email to ${email}`)
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
        dodoPaymentId: `educator-${institution.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        dodoProductId: null,
        updatesUntil,
      })
      .returning()

    console.log(`  License saved: ${newLicense.id}`)

    // 5. Send email
    console.log('Sending educator license email...')
    const emailResult = await sendEducatorLicenseEmail(
      resend,
      email,
      name,
      institution,
      licenseKey,
      plan,
      updatesUntil,
      years
    )

    if (emailResult.error) {
      console.error('  Failed to send email:', emailResult.error)
    } else {
      console.log(`  Email sent! ID: ${emailResult.data?.id}`)
    }

    // Done!
    console.log('\n' + '='.repeat(50))
    console.log('  Educator license granted successfully!')
    console.log('='.repeat(50))
    console.log(`
  License Key: ${licenseKey}
  Email:       ${email}
  Institution: ${institution}
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
