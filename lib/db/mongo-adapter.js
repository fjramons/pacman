'use strict';

const { MongoClient, ObjectId } = require('mongodb');
const config = require('../config');
const baseLogger = require('../logger');

const logger = baseLogger.child({ module: 'db/mongo-adapter' });

let client;
let dbInstance;
let connectionPromise;

function attachToApp(app, database) {
    if (app && app.locals && !app.locals.db) {
        app.locals.db = database;
    }
}

async function connect(app) {
    if (dbInstance) {
        attachToApp(app, dbInstance);
        return dbInstance;
    }

    if (!connectionPromise) {
        client = new MongoClient(config.database.url, config.database.options);
        connectionPromise = client.connect()
            .then(function(connectedClient) {
                dbInstance = connectedClient.db();
                return dbInstance;
            })
            .catch(function(err) {
                logger.error({ err, url: config.database.url, options: config.database.options }, 'Failed to connect to MongoDB');
                connectionPromise = null;
                throw err;
            });
    }

    const database = await connectionPromise;
    attachToApp(app, database);
    return database;
}

async function getDb(app) {
    return connect(app);
}

async function disconnect() {
    if (client) {
        try {
            await client.close();
        } catch (err) {
            logger.error({ err }, 'Error closing MongoDB client');
        }
    }
    client = null;
    dbInstance = null;
    connectionPromise = null;
}

async function healthCheck() {
    try {
        const db = await connect();
        await db.command({ ping: 1 });
        return true;
    } catch (err) {
        logger.error({ err }, 'Health check failed');
        return false;
    }
}

async function getTopHighscores() {
    const db = await connect();
    const docs = await db
        .collection('highscore')
        .find({})
        .sort({ score: -1 })
        .limit(10)
        .toArray();

    return docs.map(function(item) {
        return {
            name: item['name'],
            cloud: item['cloud'],
            zone: item['zone'],
            host: item['host'],
            score: item['score'],
        };
    });
}

async function insertHighscore(doc) {
    const db = await connect();
    const insertResult = await db.collection('highscore').insertOne(
        { ...doc, date: Date() },
        {
            writeConcern: {
                w: 'majority',
                j: true,
                wtimeoutMS: 10000,
            },
        }
    );
    return { success: insertResult.acknowledged === true };
}

async function createUser() {
    const db = await connect();
    const insertResult = await db.collection('userstats').insertOne(
        { date: Date() },
        {
            writeConcern: {
                w: 'majority',
                j: true,
                wtimeoutMS: 10000,
            },
        }
    );
    return insertResult.insertedId;
}

async function updateUserStats(userId, stats) {
    const db = await connect();

    let objectId;
    try {
        objectId = new ObjectId(userId);
    } catch {
        const invalidErr = new Error('Invalid userId');
        invalidErr.status = 400;
        throw invalidErr;
    }

    const updateResult = await db.collection('userstats').updateOne(
        { _id: objectId },
        {
            $set: { ...stats, date: Date() },
            $inc: { updateCounter: 1 },
        },
        {
            writeConcern: {
                w: 'majority',
                j: true,
                wtimeoutMS: 10000,
            },
        }
    );
    return { success: updateResult.acknowledged === true };
}

async function getAllUserStats() {
    const db = await connect();
    const docs = await db
        .collection('userstats')
        .find({ score: { $exists: true } })
        .sort({ _id: 1 })
        .toArray();

    return docs.map(function(item) {
        return {
            cloud: item['cloud'],
            zone: item['zone'],
            host: item['host'],
            score: item['score'],
            level: item['level'],
            lives: item['lives'],
            et: item['elapsedTime'],
            txncount: item['updateCounter'],
        };
    });
}

module.exports = {
    connect,
    getDb,
    disconnect,
    healthCheck,
    getTopHighscores,
    insertHighscore,
    createUser,
    updateUserStats,
    getAllUserStats,
};
