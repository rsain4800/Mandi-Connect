const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mandi_connect',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
});

// Helper function to execute initialization schema
const initDB = async () => {
    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            const connection = await pool.getConnection();
            await connection.query(schemaSql);
            connection.release();
            console.log('✅ Database Schema Initialized Successfully');
        }
    } catch (error) {
        console.error('❌ Error Initializing Database Schema:', error.message);
    }
};

// Used by the /health endpoint (and anywhere else that needs a real
// DB liveness check) — runs a trivial query against the pool and
// reports whether the database is actually reachable, rather than
// just returning a static "ok".
const checkDBConnection = async () => {
    try {
        await pool.query('SELECT 1');
        return true;
    } catch (error) {
        console.error('❌ Database health check failed:', error.message);
        return false;
    }
};

module.exports = {
    pool,
    initDB,
    checkDBConnection,
    query: (sql, params) => pool.query(sql, params)
};