import 'dotenv/config';

const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
const missing = required.filter((key) => !String(process.env[key] ?? '').trim());

if (missing.length) {
  throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
}

const dbPort = readPort('DB_PORT', process.env.DB_PORT ?? '3306');
const apiPort = readPort('PORT', process.env.PORT ?? '3000');
const dbName = String(process.env.DB_NAME).trim();
const frontendUrl = String(process.env.FRONTEND_URL ?? 'http://localhost:4200').trim();
const jwtSecret = String(process.env.JWT_SECRET).trim();

if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
  throw new Error('DB_NAME deve conter apenas letras, números e sublinhado.');
}

if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres.');
}

try {
  const url = new URL(frontendUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
} catch {
  throw new Error('FRONTEND_URL deve ser um endereço HTTP ou HTTPS válido.');
}

export const env = {
  port: apiPort,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  frontendUrl,
  db: {
    host: String(process.env.DB_HOST).trim(),
    port: dbPort,
    user: String(process.env.DB_USER).trim(),
    password: process.env.DB_PASSWORD ?? '',
    database: dbName
  },
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h'
};

function readPort(name, value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} deve ser um número entre 1 e 65535.`);
  }
  return port;
}
