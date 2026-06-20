'use strict';

// Optional persistence on Vercel Postgres. Entirely no-op until a POSTGRES_URL
// (or DATABASE_URL) env var exists — add the free Vercel Postgres store to the
// project and it activates with zero code changes. Every call is wrapped so a
// DB hiccup never breaks a user-facing request.

const config = require('../config');

let poolPromise = null;

function getPool() {
  if (!config.dbEnabled) return null;
  if (poolPromise) return poolPromise;
  poolPromise = (async () => {
    const { Pool } = require('pg');
    const needsSsl = !/localhost|127\.0\.0\.1/.test(config.postgresUrl);
    const pool = new Pool({
      connectionString: config.postgresUrl,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: 3,
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id              BIGSERIAL PRIMARY KEY,
        stripe_session  TEXT UNIQUE,
        email           TEXT,
        amount_cents    INTEGER,
        currency        TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS review_requests (
        id            BIGSERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT NOT NULL,
        current_role  TEXT,
        target_role   TEXT,
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    return pool;
  })().catch((err) => {
    console.error('DB init failed, falling back to logging:', err.message);
    poolPromise = null;
    return null;
  });
  return poolPromise;
}

async function recordPurchase({ sid, email, amountCents, currency }) {
  try {
    const pool = await getPool();
    if (!pool) return false;
    await pool.query(
      `INSERT INTO purchases (stripe_session, email, amount_cents, currency)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (stripe_session) DO NOTHING`,
      [sid, email, amountCents, currency]
    );
    return true;
  } catch (err) {
    console.error('recordPurchase failed:', err.message);
    return false;
  }
}

async function recordReview(r) {
  try {
    const pool = await getPool();
    if (!pool) return false;
    await pool.query(
      `INSERT INTO review_requests (name, email, current_role, target_role, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [r.name, r.email, r.current, r.target, r.notes]
    );
    return true;
  } catch (err) {
    console.error('recordReview failed:', err.message);
    return false;
  }
}

module.exports = { recordPurchase, recordReview };
