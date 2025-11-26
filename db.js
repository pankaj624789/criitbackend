require('dotenv').config(); // load env variables

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = pool;

