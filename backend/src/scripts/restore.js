import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const targetArg = args.find((arg) => !arg.startsWith('--'));

if (!targetArg) {
  console.error('Uso: npm run restore -- <caminho-do-arquivo.sql> --confirm');
  process.exit(1);
}

const backupFile = resolve(process.cwd(), targetArg);
if (!existsSync(backupFile)) {
  console.error(`Arquivo de backup não encontrado: ${backupFile}`);
  process.exit(1);
}

const fileSize = statSync(backupFile).size;
if (fileSize === 0) {
  console.error('O arquivo de backup informado está vazio.');
  process.exit(1);
}

if (!confirm) {
  console.error(`Atenção: a restauração substituirá os dados do banco "${env.db.database}".`);
  console.error(`Para confirmar, execute novamente incluindo a flag --confirm:`);
  console.error(`  npm run restore -- "${targetArg}" --confirm`);
  process.exit(1);
}

const sqlContent = await readFile(backupFile, 'utf8');
if (!sqlContent.trim()) {
  console.error('O arquivo SQL não possui comandos válidos.');
  process.exit(1);
}

const connection = await mysql.createConnection({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  multipleStatements: true,
  charset: 'utf8mb4'
});

try {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.query(`USE \`${env.db.database}\``);
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query(sqlContent);
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  const [tables] = await connection.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
  const tableKey = Object.keys(tables[0] || {})[0];
  console.log(`Backup restaurado com sucesso em "${env.db.database}" a partir de ${backupFile}:`);
  for (const row of tables) {
    const table = row[tableKey];
    const [[{ total }]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
    console.log(`- ${table}: ${total} registro(s)`);
  }
} catch (error) {
  console.error('Falha ao restaurar o backup:', error.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}
