'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'schema.sql');

// Applies schema.sql against the given pg.Pool. Used by the Postgres test
// suite; the same file is applied in K8s via k8s/base/schema-job.yaml.
async function applySchema(pool) {
    const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    await pool.query(sql);
}

async function truncateAll(pool) {
    await pool.query('TRUNCATE highscore, userstats RESTART IDENTITY');
}

module.exports = { applySchema, truncateAll };
