import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import mysql from 'mysql2/promise';

const currentDir = dirname(fileURLToPath(import.meta.url));
const sql = await readFile(resolve(currentDir, '../../database/schema.sql'), 'utf8');
const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '123456',
  multipleStatements: true
});

try {
  await connection.query(sql);
  console.log('Banco e tabelas preparados com sucesso.');
} finally {
  await connection.end();
}

