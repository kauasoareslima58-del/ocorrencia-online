import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const currentDir = dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: resolve(currentDir, '../../.env') });

const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
const missing = required.filter((key) => !String(process.env[key] ?? '').trim());

if (missing.length) {
  throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
}

const nodeEnv = String(process.env.NODE_ENV ?? 'development').trim().toLowerCase();
const isProduction = nodeEnv === 'production';
const dbPort = readPort('DB_PORT', process.env.DB_PORT ?? '3306');
const apiPort = readPort('PORT', process.env.PORT ?? '3000');
const dbName = String(process.env.DB_NAME).trim();
const frontendUrl = normalizeOrigin(String(process.env.FRONTEND_URL ?? 'http://localhost:4200').trim(), 'FRONTEND_URL');
const jwtSecret = String(process.env.JWT_SECRET).trim();

if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
  throw new Error('DB_NAME deve conter apenas letras, números e sublinhado.');
}

if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres.');
}

const insecureSecrets = [
  'troque-por-',
  'monsenhor-bicudo-chave-secreta-2026-com-mais-de-32-caracteres'
];

if (isProduction && insecureSecrets.some((prefix) => jwtSecret.startsWith(prefix))) {
  throw new Error('JWT_SECRET de exemplo não pode ser utilizada em produção. Defina uma chave aleatória forte.');
}

const extraOrigins = String(process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
  .map((origin) => normalizeOrigin(origin, 'ALLOWED_ORIGINS'));

const allowedOrigins = [...new Set([frontendUrl, ...extraOrigins])];

export const env = {
  port: apiPort,
  nodeEnv,
  isProduction,
  frontendUrl,
  allowedOrigins,
  db: {
    host: String(process.env.DB_HOST).trim(),
    port: dbPort,
    user: String(process.env.DB_USER).trim(),
    password: process.env.DB_PASSWORD ?? '',
    database: dbName
  },
  jwtSecret,
  jwtExpiresIn: String(process.env.JWT_EXPIRES_IN ?? '8h').trim(),
  jwtIssuer: 'ocorrencia-online',
  jwtAudience: 'ocorrencia-online-web',
  mysqlBinPath: String(process.env.MYSQL_BIN_PATH ?? '').trim()
};

function readPort(name, value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} deve ser um número entre 1 e 65535.`);
  }
  return port;
}

function normalizeOrigin(rawUrl, varName) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.origin;
  } catch {
    throw new Error(`${varName} deve conter endereços HTTP ou HTTPS válidos.`);
  }
}
