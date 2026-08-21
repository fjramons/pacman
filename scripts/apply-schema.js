'use strict';

// Applies schema.sql against PostgreSQL using the same PG* env vars the
// app itself reads (see lib/db/postgres-adapter.js). Runs from the app's
// own image, no separate image/psql client needed. Used by the K8s
// schema Job (k8s/base/schema-job.yaml) and can also be run manually:
// PGHOST=... PGPORT=... PGDATABASE=... PGUSER=... PGPASSWORD=... \
//   node scripts/apply-schema.js
//
// Waits for PostgreSQL to accept connections before applying the schema
// (up to WAIT_FOR_PG_TIMEOUT_MS, 60s by default), retrying every 2s. This
// is deliberate: when PostgreSQL and this Job are created together (see
// k8s/all-in-one/README.md), there's no guarantee PostgreSQL is ready by
// the time this runs. Without an internal retry, a Job with a bounded
// number of pod restarts (backoffLimit) can burn through all of them
// before PostgreSQL comes up, and fail permanently instead of just
// waiting a bit longer.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');
const WAIT_FOR_PG_TIMEOUT_MS = Number.parseInt(process.env.WAIT_FOR_PG_TIMEOUT_MS || '60000', 10);
const WAIT_FOR_PG_POLL_MS = 2000;

function sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function waitForPostgres(pool) {
    const deadline = Date.now() + WAIT_FOR_PG_TIMEOUT_MS;
    let lastErr;
    while (Date.now() < deadline) {
        try {
            const client = await pool.connect();
            client.release();
            return;
        } catch (err) {
            lastErr = err;
            console.log(`PostgreSQL not ready yet (${err.message}), retrying...`);
            await sleep(WAIT_FOR_PG_POLL_MS);
        }
    }
    throw lastErr || new Error('Timed out waiting for PostgreSQL');
}

async function main() {
    const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const mode = (process.env.PGSSLMODE || 'disable').toLowerCase();
    const pool = new Pool({
        ssl: mode === 'require' ? { rejectUnauthorized: false } : undefined,
    });

    try {
        await waitForPostgres(pool);
        await pool.query(sql);
        console.log('Schema applied successfully.');
    } finally {
        await pool.end();
    }
}

main().catch(function(err) {
    console.error('Failed to apply schema:', err);
    process.exit(1);
});
