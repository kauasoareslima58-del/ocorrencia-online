import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import mysql from 'mysql2/promise';

const currentDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(currentDir, '../..');
dotenv.config();
dotenv.config({ path: resolve(backendRoot, '.env') });

const sql = await readFile(resolve(backendRoot, 'database/schema.sql'), 'utf8');
const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missing = required.filter((key) => !String(process.env[key] ?? '').trim());

if (missing.length) {
  console.error(`Não foi possível preparar o banco: variáveis ausentes: ${missing.join(', ')}.`);
  console.error('Crie o arquivo backend/.env a partir do .env.example e tente novamente.');
  process.exit(1);
}

const database = String(process.env.DB_NAME).trim();
if (!/^[A-Za-z0-9_]+$/.test(database)) {
  console.error('Não foi possível preparar o banco: DB_NAME deve conter apenas letras, números e sublinhado.');
  process.exit(1);
}

const dbSslEnabled = ['true', '1', 'yes', 'required'].includes(
  String(process.env.DB_SSL ?? '').trim().toLowerCase()
);
const dbSslCaPath = String(process.env.DB_SSL_CA ?? '').trim();
const dbSslRejectUnauthorized = !['false', '0', 'no'].includes(
  String(process.env.DB_SSL_REJECT_UNAUTHORIZED ?? 'true').trim().toLowerCase()
);
const ssl = dbSslEnabled
  ? {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: dbSslRejectUnauthorized,
      ...(dbSslCaPath ? { ca: readFileSync(resolve(backendRoot, dbSslCaPath), 'utf8') } : {})
    }
  : undefined;

const connection = await mysql.createConnection({
  host: String(process.env.DB_HOST).trim(),
  port: Number(process.env.DB_PORT ?? 3306),
  user: String(process.env.DB_USER).trim(),
  password: process.env.DB_PASSWORD ?? '',
  ...(ssl ? { ssl } : {}),
  multipleStatements: true
});

async function ensureColumn(tableName, columnName, definitionSql) {
  const [cols] = await connection.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [database, tableName, columnName]
  );
  if (!cols.length) {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definitionSql}`);
    console.log(`- Coluna adicionada com segurança: ${tableName}.${columnName}`);
  }
}

async function ensureIndex(tableName, indexName, columnsSql) {
  const [indexes] = await connection.execute(
    `SELECT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [database, tableName, indexName]
  );
  if (!indexes.length) {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (${columnsSql})`);
    console.log(`- Índice adicionado com segurança: ${tableName}.${indexName}`);
  }
}

try {
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (createErr) {
    // Em provedores na nuvem (ex.: Aiven, TiDB) o banco já vem criado e o usuário pode não ter privilégio global de CREATE DATABASE
    if (!['ER_DBACCESS_DENIED_ERROR', 'ER_SPECIFIC_ACCESS_DENIED_ERROR'].includes(createErr?.code)) {
      throw createErr;
    }
  }

  await connection.query(`USE \`${database}\``);
  await connection.query(sql);

  // Migrações incrementais seguras em bancos existentes (sem apagar dados nem recriar tabelas)
  await ensureColumn('users', 'token_version', 'token_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER active');
  await ensureIndex('users', 'idx_users_role_active', 'role, active');
  await ensureIndex('students', 'idx_students_class_active', 'class_name, active');
  await ensureIndex('occurrences', 'idx_occurrences_status_date', 'status, occurrence_date');
  await ensureIndex('occurrences', 'idx_occurrences_priority', 'priority');
  await ensureIndex('occurrences', 'idx_occurrences_category', 'category_id');
  await ensureIndex('occurrences', 'idx_occurrences_location', 'location_id');
  await ensureIndex('occurrences', 'idx_occurrences_created_at', 'created_at');
  await ensureIndex('audit_logs', 'idx_audit_entity_action', 'entity, action, created_at');

  const [roleColumn] = await connection.execute(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
     LIMIT 1`,
    [database]
  );
  if (roleColumn[0]?.COLUMN_TYPE?.includes("'ALUNO'")) {
    await connection.query(`UPDATE users SET active = FALSE WHERE role = 'ALUNO'`);
  }

  console.log(`Banco "${database}" e tabelas preparados com sucesso.`);
} catch (error) {
  console.error(`Não foi possível preparar o banco: ${databaseErrorMessage(error)}`);
  process.exitCode = 1;
} finally {
  await connection.end();
}

function databaseErrorMessage(error) {
  if (error?.code === 'ER_ACCESS_DENIED_ERROR') {
    return 'usuário ou senha do MySQL incorretos. Confira DB_USER e DB_PASSWORD no arquivo .env.';
  }
  if (error?.code === 'ECONNREFUSED') {
    return 'o MySQL não está ligado ou a porta configurada está incorreta.';
  }
  if (error?.code === 'HANDSHAKE_NO_SSL_SUPPORT' || error?.code === 'ER_SECURE_TRANSPORT_REQUIRED') {
    return 'o servidor MySQL exige conexão criptografada. Defina DB_SSL=true no arquivo backend/.env.';
  }
  return error?.message ?? 'erro desconhecido.';
}
