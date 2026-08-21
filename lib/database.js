'use strict';

// Thin re-export: the actual Mongo/Postgres adapters live in ./db,
// selected at require time via DB_DRIVER (see lib/db/index.js).
module.exports = require('./db');
