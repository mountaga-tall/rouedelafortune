import { neon } from "@neondatabase/serverless";

let sqlClient;
let schemaPromise = null;

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL n'est pas configurée sur Vercel.");
  }
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

async function initializeSchema() {
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
    last_spin_started_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS last_spin_started_at TIMESTAMPTZ`;

  await sql`CREATE TABLE IF NOT EXISTS spin_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    segments JSONB NOT NULL,
    target_index SMALLINT NOT NULL CHECK (target_index >= 0 AND target_index < 14),
    prize_label VARCHAR(100) NOT NULL,
    prize_icon VARCHAR(12) NOT NULL,
    is_win BOOLEAN NOT NULL,
    spin_number BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
    completed_at TIMESTAMPTZ
  )`;

  await sql`ALTER TABLE spin_challenges
    ADD COLUMN IF NOT EXISTS spin_number BIGINT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS spin_challenges_spin_number_uidx
    ON spin_challenges(spin_number) WHERE spin_number IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS spin_challenges_customer_created_idx
    ON spin_challenges(customer_id, created_at DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS spins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    prize_label VARCHAR(100) NOT NULL,
    prize_icon VARCHAR(12) NOT NULL,
    is_win BOOLEAN NOT NULL DEFAULT FALSE,
    validation_code VARCHAR(16) UNIQUE,
    spin_number BIGINT,
    played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE spins
    ADD COLUMN IF NOT EXISTS spin_number BIGINT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS spins_spin_number_uidx
    ON spins(spin_number) WHERE spin_number IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS spins_customer_played_at_idx
    ON spins(customer_id, played_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS customers_created_at_idx
    ON customers(created_at DESC)`;

  // Compteur global : un cadeau au plus à chaque palier de 50 tours.
  await sql`CREATE TABLE IF NOT EXISTS game_state (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    total_spins BIGINT NOT NULL DEFAULT 0,
    spins_since_last_win SMALLINT NOT NULL DEFAULT 0,
    pending_winning_challenge UUID,
    pending_winning_expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  // Migration unique : reprend le compteur des anciens tirages lors de la première initialisation.
  await sql`WITH last_win AS (
    SELECT MAX(played_at) AS played_at FROM spins WHERE is_win = TRUE
  ),
  metrics AS (
    SELECT
      GREATEST(
        (SELECT COUNT(*) FROM spins),
        (SELECT COUNT(*) FROM spin_challenges)
      )::bigint AS total_spins,
      LEAST(50, GREATEST(
        (SELECT COUNT(*) FROM spin_challenges
          WHERE created_at > COALESCE((SELECT played_at FROM last_win), '-infinity'::timestamptz)),
        (SELECT COUNT(*) FROM spins
          WHERE played_at > COALESCE((SELECT played_at FROM last_win), '-infinity'::timestamptz))
      ))::smallint AS spins_since_last_win
  )
  INSERT INTO game_state (id, total_spins, spins_since_last_win)
  SELECT 1, total_spins, spins_since_last_win FROM metrics
  ON CONFLICT (id) DO NOTHING`;
}

export function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = initializeSchema().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}
