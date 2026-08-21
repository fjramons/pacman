'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_DRIVER = 'postgres';

const { expect } = require('chai');
const { Pool } = require('pg');
const { applySchema } = require('../helpers/apply-schema');

// Runs against a real PostgreSQL instance reachable via PGHOST/PGPORT/etc.
// (the "pg-sim" local kind cluster, or the real Terraform-provisioned
// instance) - see the "Entorno local" README for how to stand it up.
// Not part of `npm test`; run explicitly via `npm run test:postgres`.
describe('Database helper (Postgres adapter)', function () {
    let Database;
    let setupPool;

    before(async function () {
        this.timeout(30000);
        // Re-assert here (not just at module load): mocha requires every
        // spec file up front, so a sibling suite's after() hook running
        // between file loads and this hook could have reset it.
        process.env.DB_DRIVER = 'postgres';

        if (!process.env.PGHOST) {
            throw new Error(
                'PGHOST is not set. Point it at a reachable PostgreSQL instance ' +
                '(e.g. the local "pg-sim" kind cluster) before running npm run test:postgres.'
            );
        }

        setupPool = new Pool({
            ssl: (process.env.PGSSLMODE || 'disable').toLowerCase() === 'require'
                ? { rejectUnauthorized: false }
                : undefined,
        });
        await applySchema(setupPool);

        delete require.cache[require.resolve('../../lib/database')];
        delete require.cache[require.resolve('../../lib/db')];
        delete require.cache[require.resolve('../../lib/db/postgres-adapter')];

        Database = require('../../lib/database');
    });

    after(async function () {
        if (Database) {
            await Database.disconnect();
        }
        if (setupPool) {
            await setupPool.end();
        }
        delete process.env.DB_DRIVER;
    });

    it('attaches the database instance to the app', async function () {
        const app = { locals: {} };
        const db = await Database.connect(app);

        expect(db).to.exist;
        expect(app.locals.db).to.equal(db);
    });

    it('reuses the cached database instance', async function () {
        const firstApp = { locals: {} };
        const firstDb = await Database.connect(firstApp);

        const secondApp = { locals: {} };
        const secondDb = await Database.getDb(secondApp);

        expect(secondDb).to.equal(firstDb);
        expect(secondApp.locals.db).to.equal(secondDb);
    });

    it('disconnects and allows reconnection', async function () {
        await Database.disconnect();

        const reconnectApp = { locals: {} };
        const db = await Database.connect(reconnectApp);

        expect(db).to.exist;
        expect(reconnectApp.locals.db).to.equal(db);
    });

    it('reports a healthy connection', async function () {
        await Database.connect({ locals: {} });
        const healthy = await Database.healthCheck();
        expect(healthy).to.equal(true);
    });
});
