const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME || 'rashcuts';

(async () => {
  let connection;
  try {
    connection = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
    const sql = await fs.readFile(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await connection.query(sql);
    console.log(`Rashcuts MySQL database is ready: ${database}`);
  } catch (error) {
    console.error('Database setup failed:', error.message);
    process.exitCode = 1;
  } finally {
    await connection?.end();
  }
})();
