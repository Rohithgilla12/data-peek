# data-peek Web

Marketing website and licensing portal for data-peek.

## Tech Stack

- Next.js 16 (App Router)
- Tailwind CSS 4
- Clerk (Authentication)
- Drizzle ORM + PostgreSQL
- DodoPayments (Payments)
- Resend (Emails)

## Development

```bash
# From the root directory
pnpm dev:web

# Or from this directory
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Required variables:

- `DATABASE_URL` - PostgreSQL connection string
- `CLERK_SECRET_KEY` - Clerk authentication
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `DODO_API_KEY` - DodoPayments API key
- `DODO_WEBHOOK_SECRET` - DodoPayments webhook secret
- `RESEND_API_KEY` - Resend email API key

## Deployment

The web app is designed to be deployed on Vercel.
