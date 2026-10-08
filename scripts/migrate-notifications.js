const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'rashcuts'
    });
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_change_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        admin_session_id BIGINT UNSIGNED NOT NULL,
        admin_user_id BIGINT UNSIGNED NOT NULL,
        area VARCHAR(40) NOT NULL,
        action VARCHAR(40) NOT NULL,
        entity_id VARCHAR(190) DEFAULT '',
        summary VARCHAR(800) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        email_sent_at DATETIME DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_change_session (admin_session_id, email_sent_at, created_at),
        KEY idx_change_user (admin_user_id, created_at),
        CONSTRAINT fk_change_events_user
          FOREIGN KEY (admin_user_id) REFERENCES admin_users(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('Rashcuts notification table is ready: admin_change_events');
  } catch (error) {
    console.error('Notification migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await connection?.end();
  }
})();
