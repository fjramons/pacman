'use strict';

process.env.NODE_ENV = 'test';
// This suite exercises the preserved Mongo adapter specifically (the
// default DB_DRIVER is now "postgres" - see test/postgres/ for that path).
process.env.DB_DRIVER = 'mongo';

const { expect } = require('chai');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

describe('Database helper (Mongo adapter)', function () {
    let replSet;
    let Database;

    before(async function () {
        this.timeout(60000);
        // Re-assert here (not just at module load): mocha requires every
        // spec file up front, so a sibling suite's after() hook running
        // between file loads and this hook could have reset it.
        process.env.DB_DRIVER = 'mongo';

        replSet = await MongoMemoryReplSet.create({
            replSet: { count: 1, storageEngine: 'wiredTiger' }
        });

        const uri = replSet.getUri();
        const url = new URL(uri);

        process.env.MONGO_SERVICE_HOST = url.hostname;
        process.env.MY_MONGO_PORT = url.port;
        process.env.MONGO_DATABASE = 'pacman';
        process.env.MONGO_USE_SSL = 'false';
        process.env.MONGO_VALIDATE_SSL = 'true';

        const replicaSetName = url.searchParams.get('replicaSet');
        if (replicaSetName) {
            process.env.MONGO_REPLICA_SET = replicaSetName;
        }

        delete require.cache[require.resolve('../lib/config')];
        delete require.cache[require.resolve('../lib/database')];
        delete require.cache[require.resolve('../lib/db')];
        delete require.cache[require.resolve('../lib/db/mongo-adapter')];

        Database = require('../lib/database');
    });

    after(async function () {
        if (Database) {
            await Database.disconnect();
        }
        if (replSet) {
            await replSet.stop();
        }

        delete process.env.MONGO_SERVICE_HOST;
        delete process.env.MY_MONGO_PORT;
        delete process.env.MONGO_DATABASE;
        delete process.env.MONGO_USE_SSL;
        delete process.env.MONGO_VALIDATE_SSL;
        delete process.env.MONGO_REPLICA_SET;
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
});
