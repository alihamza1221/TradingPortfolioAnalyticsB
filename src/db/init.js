/**
 * Database initialisation script.
 * Run once:  npm run db:init
 *
 * Creates the database and all tables from schema.sql.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

(async () => {
    /* Connect WITHOUT selecting a database so we can CREATE DATABASE */
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true,
        timezone: '+00:00',
    });

    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema.sql …');
    await conn.query(sql);
    console.log('✔  Database and tables created successfully.');

    await conn.end();
    process.exit(0);
})().catch((err) => {
    console.error('DB initialisation failed:', err);
    process.exit(1);
});
