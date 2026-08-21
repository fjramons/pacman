'use strict';

const driver = (process.env.DB_DRIVER || 'postgres').toLowerCase();

if (driver !== 'postgres' && driver !== 'mongo') {
    throw new Error(`Unsupported DB_DRIVER "${driver}". Use "postgres" or "mongo".`);
}

module.exports = driver === 'mongo'
    ? require('./mongo-adapter')
    : require('./postgres-adapter');
