'use strict';

const { Pool } = require('pg');
const baseLogger = require('../logger');

const logger = baseLogger.child({ module: 'db/postgres-adapter' });

let pool;
let connectionPromise;

function buildSslOption() {
    const mode = (process.env.PGSSLMODE || 'disable').toLowerCase();
    return mode === 'require' ? { rejectUnauthorized: false } : undefined;
}

function attachToApp(app, database) {
    if (app && app.locals && !app.locals.db) {
        app.locals.db = database;
    }
}

async function connect(app) {
    if (!pool) {
        pool = new Pool({ ssl: buildSslOption() });
        pool.on('error', function(err) {
            logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
        });
    }

    if (!connectionPromise) {
        connectionPromise = (async function() {
            const client = await pool.connect();
            client.release();
            return pool;
        })().catch(function(err) {
            logger.error({ err }, 'Failed to connect to PostgreSQL');
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
    if (pool) {
        try {
            await pool.end();
        } catch (err) {
            logger.error({ err }, 'Error closing PostgreSQL pool');
        }
    }
    pool = null;
    connectionPromise = null;
}

async function healthCheck() {
    try {
        const db = await connect();
        await db.query('SELECT 1');
        return true;
    } catch (err) {
        logger.error({ err }, 'Health check failed');
        return false;
    }
}

async function getTopHighscores() {
    const db = await connect();
    const result = await db.query(
        'SELECT name, cloud, zone, host, score FROM highscore ORDER BY score DESC LIMIT 10'
    );
    return result.rows;
}

async function insertHighscore(doc) {
    const db = await connect();
    const result = await db.query(
        `INSERT INTO highscore (name, cloud, zone, host, score, level, referer, user_agent, hostname, ip_addr)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
            doc.name,
            doc.cloud,
            doc.zone,
            doc.host,
            doc.score,
            doc.level,
            doc.referer,
            doc.user_agent,
            doc.hostname,
            doc.ip_addr || null,
        ]
    );
    return { success: result.rowCount === 1 };
}

async function createUser() {
    const db = await connect();
    const result = await db.query('INSERT INTO userstats DEFAULT VALUES RETURNING id');
    return result.rows[0].id;
}

async function updateUserStats(userId, stats) {
    const db = await connect();

    const id = parseInt(userId, 10);
    if (Number.isNaN(id)) {
        const invalidErr = new Error('Invalid userId');
        invalidErr.status = 400;
        throw invalidErr;
    }

    const result = await db.query(
        `UPDATE userstats
            SET cloud = $1, zone = $2, host = $3, score = $4, level = $5, lives = $6,
                elapsed_time = $7, date = now(), referer = $8, user_agent = $9,
                hostname = $10, ip_addr = $11, update_counter = update_counter + 1
          WHERE id = $12`,
        [
            stats.cloud,
            stats.zone,
            stats.host,
            stats.score,
            stats.level,
            stats.lives,
            stats.elapsedTime,
            stats.referer,
            stats.user_agent,
            stats.hostname,
            stats.ip_addr || null,
            id,
        ]
    );
    return { success: result.rowCount === 1 };
}

async function getAllUserStats() {
    const db = await connect();
    const result = await db.query(
        `SELECT cloud, zone, host, score, level, lives,
                elapsed_time AS et, update_counter AS txncount
           FROM userstats
          WHERE score IS NOT NULL
          ORDER BY id ASC`
    );
    return result.rows;
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
