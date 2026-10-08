const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rashcuts',
    charset: 'utf8mb4'
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      id TINYINT UNSIGNED NOT NULL,
      admin_email VARCHAR(190) NOT NULL DEFAULT '',
      client_email VARCHAR(190) NOT NULL DEFAULT '',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_attempts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      visitor_key VARCHAR(80) NOT NULL DEFAULT '',
      stage VARCHAR(24) NOT NULL DEFAULT 'started',
      channel VARCHAR(24) NOT NULL DEFAULT '',
      service_summary VARCHAR(1000) NOT NULL DEFAULT '',
      service_count INT UNSIGNED NOT NULL DEFAULT 0,
      appointment_date DATE DEFAULT NULL,
      appointment_time VARCHAR(40) NOT NULL DEFAULT '',
      private_session TINYINT(1) NOT NULL DEFAULT 0,
      estimated_total INT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip_hash CHAR(64) NOT NULL DEFAULT '',
      PRIMARY KEY (id),
      KEY idx_booking_created (created_at),
      KEY idx_booking_visitor_stage (visitor_key, stage, created_at)
    ) ENGINE=InnoDB
  `);

  const adminEmail = String(process.env.NOTIFY_DEV_EMAIL || '').trim().toLowerCase();
  const clientEmail = String(process.env.NOTIFY_CLIENT_EMAIL || '').trim().toLowerCase();
  await pool.execute(`
    INSERT INTO notification_settings (id, admin_email, client_email)
    VALUES (1, ?, ?)
    ON DUPLICATE KEY UPDATE id=id
  `, [adminEmail, clientEmail]);

  console.log('Rashcuts admin dashboard migration complete.');
  await pool.end();
}

main().catch(async (error) => {
  console.error('Admin dashboard migration failed:', error.message);
  process.exitCode = 1;
});
