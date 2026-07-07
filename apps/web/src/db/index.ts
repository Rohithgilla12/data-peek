import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Connection string from environment
const connectionString = process.env.DATABASE_URL!;

// For serverless environments (Vercel, Cloudflare), use connection pooling
const client = postgres(connectionString, {
  max: 1, // Single connection for serverless
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

export * from "./schema";
