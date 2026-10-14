import pg from 'pg';

const { Pool } = pg;
let pool;
let schemaReady;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!databaseConfigured()) throw new Error('DATABASE_URL is not configured');
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS gev_users (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email_verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gev_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES gev_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS gev_sessions_user_id_idx ON gev_sessions(user_id);
      CREATE TABLE IF NOT EXISTS gev_magic_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES gev_users(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL CHECK (purpose IN ('login', 'verify', 'reset')),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gev_subscriptions (
        stripe_subscription_id TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES gev_users(id) ON DELETE CASCADE,
        stripe_customer_id TEXT NOT NULL,
        status TEXT NOT NULL,
        current_period_end TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS gev_subscriptions_user_id_idx ON gev_subscriptions(user_id);
      CREATE TABLE IF NOT EXISTS gev_app_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export async function closeDatabase() {
  if (!pool) return;
  const current = pool;
  pool = null;
  schemaReady = null;
  await current.end();
}
