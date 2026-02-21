const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.RAILWAY_ENVIRONMENT
        ? { rejectUnauthorized: false }
        : false
});

module.exports = pool;