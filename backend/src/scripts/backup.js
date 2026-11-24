import { existsSync, mkdirSync, createWriteStream, statSync, unlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const backupDir = resolve(currentDir, '../../backups');
mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const target = resolve(backupDir, `ocorrencia-online-${stamp}.sql`);

function findMysqlTool(toolName) {
  const exe = process.platform === 'win32' ? `${toolName}.exe` : toolName;
  if (env.mysqlBinPath) {
    const configured = join(env.mysqlBinPath, exe);
    if (existsSync(configured)) return configured;
  }
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin',
      'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin',
      'C:\\Program Files\\MySQL\\MySQL Server 9.0\\bin',
      'C:\\xampp\\mysql\\bin'
    ];
    for (const dir of candidates) {
      const full = join(dir, exe);
      if (existsSync(full)) return full;
    }
  }
  return exe;
}

function runMysqldump(binPath, targetFile) {
  return new Promise((resolvePromise, rejectPromise) => {
    const output = createWriteStream(targetFile, { flags: 'w' });
    const args = [
      `--host=${env.db.host}`,
      `--port=${env.db.port}`,
      `--user=${env.db.user}`,
      '--default-character-set=utf8mb4',
      '--single-transaction',
      '--routines',
      '--triggers',
      '--add-drop-table',
      ...(env.dbSslEnabled ? ['--ssl-mode=REQUIRED'] : []),
      env.db.database
    ];

    const dump = spawn(binPath, args, {
      shell: false,
      env: { ...process.env, MYSQL_PWD: env.db.password }
    });

    let stderr = '';
    dump.stdout.pipe(output);
    dump.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    dump.on('error', (error) => {
      output.destroy();
      rejectPromise(error);
    });
    dump.on('close', (code) => {
      output.end(() => {
        if (code === 0) {
          resolvePromise();
        } else {
          rejectPromise(new Error(stderr.trim() || `mysqldump encerrou com código ${code}`));
        }
      });
    });
  });
}

async function runSqlFallbackDump(targetFile) {
  const connection = await mysql.createConnection({
    ...env.db,
    charset: 'utf8mb4',
    dateStrings: true
  });

  try {
    const lines = [
      `-- Backup lógico gerado pelo Ocorrência Online em ${new Date().toISOString()}`,
      `-- Banco de dados: ${env.db.database}`,
      'SET NAMES utf8mb4;',
      'SET FOREIGN_KEY_CHECKS = 0;',
      ''
    ];

    const [tables] = await connection.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
    const tableKey = Object.keys(tables[0] || {})[0];
    const tableNames = tables.map((row) => row[tableKey]);

    for (const table of tableNames) {
      const [[createRow]] = await connection.query(`SHOW CREATE TABLE \`${table}\``);
      const createSql = createRow['Create Table'];
      lines.push(`-- Estrutura da tabela \`${table}\``);
      lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
      lines.push(`${createSql};`);
      lines.push('');

      const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
      if (rows.length) {
        const columns = Object.keys(rows[0]).map((col) => `\`${col}\``).join(', ');
        lines.push(`-- Dados da tabela \`${table}\` (${rows.length} registros)`);
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
          const slice = rows.slice(i, i + batchSize);
          const valuesSql = slice.map((row) => {
            const vals = Object.values(row).map((val) => {
              if (val === null || val === undefined) return 'NULL';
              if (typeof val === 'object') return connection.escape(JSON.stringify(val));
              return connection.escape(val);
            });
            return `(${vals.join(', ')})`;
          }).join(',\n  ');
          lines.push(`INSERT INTO \`${table}\` (${columns}) VALUES\n  ${valuesSql};`);
        }
        lines.push('');
      }
    }

    lines.push('SET FOREIGN_KEY_CHECKS = 1;');
    lines.push('');
    await writeFile(targetFile, lines.join('\n'), 'utf8');
  } finally {
    await connection.end();
  }
}

try {
  const dumpBin = findMysqlTool('mysqldump');
  try {
    await runMysqldump(dumpBin, target);
    const size = statSync(target).size;
    if (size === 0) throw new Error('Arquivo de backup gerado está vazio.');
    console.log(`Backup criado com sucesso via mysqldump: ${target} (${(size / 1024).toFixed(1)} KB)`);
  } catch (dumpErr) {
    if (existsSync(target)) unlinkSync(target);
    if (dumpErr?.code === 'ENOENT') {
      console.warn('mysqldump não encontrado no PATH; utilizando gerador SQL interno compatível...');
      await runSqlFallbackDump(target);
      const size = statSync(target).size;
      if (size === 0) throw new Error('Arquivo de backup gerado está vazio.');
      console.log(`Backup SQL criado com sucesso (modo interno): ${target} (${(size / 1024).toFixed(1)} KB)`);
    } else {
      throw dumpErr;
    }
  }
} catch (error) {
  if (existsSync(target)) {
    try { unlinkSync(target); } catch { /* ignore cleanup error */ }
  }
  console.error('Não foi possível criar o backup:', error.message);
  process.exitCode = 1;
}
