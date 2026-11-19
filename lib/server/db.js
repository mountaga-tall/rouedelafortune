import { neon } from "@neondatabase/serverless";

let sqlClient;

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL n'est pas configurée sur Vercel.");
  }
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

export async function ensureSchema() {
  const sql = getSql();

  await sql`CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    phone VARCHAR(24) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    privacy_notice_version VARCHAR(40) NOT NULL,
    privacy_consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    marketing_consent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS spins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    prize_label VARCHAR(100) NOT NULL,
    prize_icon VARCHAR(12) NOT NULL,
    is_win BOOLEAN NOT NULL DEFAULT FALSE,
    validation_code VARCHAR(16) UNIQUE,
    played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS spins_customer_played_at_idx
    ON spins(customer_id, played_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS customers_created_at_idx
    ON customers(created_at DESC)`;
}
