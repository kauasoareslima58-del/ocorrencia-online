import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import mysql from 'mysql2/promise';

const currentDir = dirname(fileURLToPath(import.meta.url));
const sql = await readFile(resolve(currentDir, '../../database/schema.sql'), 'utf8');
const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missing = required.filter((key) => !String(process.env[key] ?? '').trim());

if (missing.length) {
  console.error(`Não foi possível preparar o banco: variáveis ausentes: ${missing.join(', ')}.`);
  console.error('Crie o arquivo .env a partir do .env.example e tente novamente.');
  process.exit(1);
}

const database = String(process.env.DB_NAME).trim();
if (!/^[A-Za-z0-9_]+$/.test(database)) {
  console.error('Não foi possível preparar o banco: DB_NAME deve conter apenas letras, números e sublinhado.');
  process.exit(1);
}

const connection = await mysql.createConnection({
  host: String(process.env.DB_HOST).trim(),
  port: Number(process.env.DB_PORT ?? 3306),
  user: String(process.env.DB_USER).trim(),
  password: process.env.DB_PASSWORD ?? '',
  multipleStatements: true
});

try {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.query(`USE \`${database}\``);
  await connection.query(sql);
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
  return error?.message ?? 'erro desconhecido.';
}
