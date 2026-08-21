'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_DRIVER = 'postgres';

const { expect } = require('chai');
const { Pool } = require('pg');
const supertest = require('supertest');
const { applySchema, truncateAll } = require('../helpers/apply-schema');

// Runs against a real PostgreSQL instance reachable via PGHOST/PGPORT/etc.
// (the "pg-sim" local kind cluster, or the real Terraform-provisioned
// instance) - see the "Entorno local" README for how to stand it up.
// Not part of `npm test`; run explicitly via `npm run test:postgres`.
describe('Route integration (Postgres adapter)', function () {
    let Database;
    let setupPool;
    let app;
    let request;

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
        delete require.cache[require.resolve('../../app')];

        Database = require('../../lib/database');
        app = require('../../app');
        await Database.connect(app);
        request = supertest(app);
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

    beforeEach(async function () {
        await truncateAll(setupPool);
    });

    describe('Highscore routes', function () {
        it('returns an empty list when there are no highscores', async function () {
            const response = await request.get('/highscores/list').expect(200);

            expect(response.body).to.be.an('array').that.is.empty;
        });

        it('inserts a highscore and returns success', async function () {
            const response = await request
                .post('/highscores')
                .type('form')
                .send({
                    name: 'Colin',
                    cloud: '',
                    zone: '',
                    host: '',
                    score: '100',
                    level: '1',
                })
                .expect(200);

            expect(response.body).to.include({
                name: 'Colin',
                zone: '',
                score: 100,
                level: 1,
                rs: 'success',
            });

            const result = await setupPool.query('SELECT score FROM highscore WHERE name = $1', ['Colin']);
            expect(result.rows).to.have.length(1);
            expect(result.rows[0].score).to.equal(100);
        });

        it('returns highscores sorted in descending order', async function () {
            const scores = [50, 200, 150];
            for (let i = 0; i < scores.length; i++) {
                await request
                    .post('/highscores')
                    .type('form')
                    .send({
                        name: `Player ${i + 1}`,
                        cloud: '',
                        zone: '',
                        host: '',
                        score: String(scores[i]),
                        level: '1',
                    })
                    .expect(200);
            }

            const response = await request.get('/highscores/list').expect(200);
            expect(response.body).to.have.length(3);

            const returnedScores = response.body.map(function(entry) {
                return entry.score;
            });

            expect(returnedScores).to.deep.equal([200, 150, 50]);
        });
    });

    describe('User routes', function () {
        it('creates a user ID and retrieves live stats', async function () {
            const idResponse = await request.get('/user/id').expect(200);
            const userId = idResponse.body;

            // Postgres backend: an opaque autoincrement integer, unlike the
            // 24-char Mongo ObjectId string - the frontend treats it as
            // opaque either way (confirmed in public/pacman-canvas.js).
            expect(userId).to.be.a('number');

            const updateResponse = await request
                .post('/user/stats')
                .type('form')
                .send({
                    userId,
                    cloud: 'cloudy',
                    zone: 'zone-1',
                    host: 'host-1',
                    score: '250',
                    level: '3',
                    lives: '2',
                    elapsedTime: '120',
                })
                .expect(200);

            expect(updateResponse.body).to.deep.equal({ rs: 'success' });

            const statsResponse = await request.get('/user/stats').expect(200);
            expect(statsResponse.body).to.be.an('array').with.lengthOf(1);

            const stats = statsResponse.body[0];
            expect(stats).to.include({
                cloud: 'cloudy',
                zone: 'zone-1',
                host: 'host-1',
                score: 250,
                level: 3,
                lives: 2,
                et: 120,
                txncount: 1,
            });
        });

        it('rejects an invalid userId with 400', async function () {
            const response = await request
                .post('/user/stats')
                .type('form')
                .send({
                    userId: 'not-a-number',
                    cloud: '',
                    zone: '',
                    host: '',
                    score: '1',
                    level: '1',
                    lives: '1',
                    elapsedTime: '1',
                })
                .expect(400);

            expect(response.text).to.include('Invalid userId');
        });
    });
});
