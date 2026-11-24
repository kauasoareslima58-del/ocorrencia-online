import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true,
  decimalNumbers: true
});

let runtimeSchemaPromise = null;

export async function checkDatabase() {
  await pool.query('SELECT 1');
}

/**
 * Garante compatibilidade incremental em bancos existentes sem apagar ou recriar tabelas.
 */
export async function ensureRuntimeSchema() {
  if (!runtimeSchemaPromise) {
    runtimeSchemaPromise = (async () => {
      const [tokenVersionCols] = await pool.execute(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'users'
           AND COLUMN_NAME = 'token_version'
         LIMIT 1`
      );

      if (!tokenVersionCols.length) {
        await pool.query(
          'ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER active'
        );
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS notification_reads (
          user_id INT UNSIGNED NOT NULL,
          notification_key VARCHAR(80) NOT NULL,
          read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, notification_key),
          CONSTRAINT fk_notification_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
    })().catch((err) => {
      runtimeSchemaPromise = null;
      throw err;
    });
  }

  return runtimeSchemaPromise;
}
