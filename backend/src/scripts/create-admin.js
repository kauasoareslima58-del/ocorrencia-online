import bcrypt from 'bcryptjs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ensureRuntimeSchema, pool } from '../config/db.js';
import { isStrongPassword, isValidEmail } from '../utils/validators.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [key, inlineVal] = arg.slice(2).split('=');
      if (inlineVal !== undefined) {
        args[key] = inlineVal;
      } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args[key] = argv[++i];
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
let name = String(args.name ?? '').trim();
let email = String(args.email ?? '').trim().toLowerCase();
let password = String(args.password ?? '');

try {
  await ensureRuntimeSchema();

  if (!name || !email || !password) {
    const rl = readline.createInterface({ input, output });
    try {
      console.log('=== Cadastro de Administrador / Coordenação — Ocorrência Online ===');
      if (!name) name = (await rl.question('Nome completo: ')).trim();
      if (!email) email = (await rl.question('E-mail institucional: ')).trim().toLowerCase();
      if (!password) password = await rl.question('Senha (mín. 8 caracteres, A-Z, a-z, 0-9 e símbolo): ');
    } finally {
      rl.close();
    }
  }

  if (name.length < 3 || name.length > 120) {
    throw new Error('O nome deve ter entre 3 e 120 caracteres.');
  }
  if (!isValidEmail(email)) {
    throw new Error('Informe um e-mail válido.');
  }
  if (!isStrongPassword(password)) {
    throw new Error('A senha deve ter entre 8 e 72 caracteres, contendo maiúscula, minúscula, número e símbolo.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.execute(
    `INSERT INTO users (name, email, password_hash, role, active, token_version)
     VALUES (?, ?, ?, 'ADMINISTRADOR', TRUE, 1)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       password_hash = VALUES(password_hash),
       role = 'ADMINISTRADOR',
       active = TRUE,
       token_version = token_version + 1`,
    [name, email, passwordHash]
  );

  const [[admin]] = await pool.execute(
    'SELECT id, name, email, role, active FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  console.log(`Administrador salvo com sucesso: #${admin.id} — ${admin.name} <${admin.email}>`);
} catch (error) {
  console.error(`Erro ao criar administrador: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
