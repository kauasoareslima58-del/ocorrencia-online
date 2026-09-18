import 'dotenv/config';
import { mkdirSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const currentDir = dirname(fileURLToPath(import.meta.url));
const backupDir = resolve(currentDir, '../../backups');
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const target = resolve(backupDir, `ocorrencia-online-${stamp}.sql`);
const output = createWriteStream(target, { flags: 'wx' });
const args = [
  `--host=${process.env.DB_HOST ?? 'localhost'}`,
  `--port=${process.env.DB_PORT ?? '3306'}`,
  `--user=${process.env.DB_USER ?? 'root'}`,
  '--single-transaction', '--routines', '--triggers', process.env.DB_NAME ?? 'ocorrencia_online'
];
const dump = spawn('mysqldump', args, {
  shell: false,
  env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD ?? '' }
});
dump.stdout.pipe(output);
dump.stderr.on('data', (chunk) => process.stderr.write(chunk));
dump.on('error', (error) => { console.error('Não foi possível iniciar o backup:', error.message); process.exitCode = 1; });
dump.on('close', (code) => {
  if (code === 0) console.log(`Backup criado: ${target}`);
  else { console.error(`Backup finalizado com erro (código ${code}).`); process.exitCode = 1; }
});
