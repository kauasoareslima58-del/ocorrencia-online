import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import { allowRoles, authenticate } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { metadataRouter } from './routes/metadata.routes.js';
import { occurrencesRouter } from './routes/occurrences.routes.js';
import { studentsRouter } from './routes/students.routes.js';
import { auditRouter } from './routes/audit.routes.js';
import { teachersRouter } from './routes/teachers.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, '../../frontend/dist/ocorrencia-online/browser');
const hasFrontendBuild = fs.existsSync(frontendDist);

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' }
}));

const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(cors({
  origin(origin, callback) {
    // Requisições sem cabeçalho Origin (ex: mesma origem, curl, scripts locais) são permitidas.
    if (!origin) return callback(null, true);

    if (env.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    if (!env.isProduction && localOriginPattern.test(origin)) {
      return callback(null, true);
    }

    const corsError = new Error('Origem não autorizada pelo CORS.');
    corsError.code = 'CORS_NOT_ALLOWED';
    corsError.status = 403;
    return callback(corsError);
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: false,
  maxAge: 600
}));

app.use(express.json({ limit: '512kb' }));

// Servir frontend compilado se existir
if (hasFrontendBuild) {
  app.use(express.static(frontendDist));
}

// Rate limiters
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Muitas requisições de autenticação. Tente novamente em instantes.' }
});

const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Limite de requisições excedido. Aguarde um momento.' }
});

// Rotas públicas da API
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'ocorrencia-online-api' }));
app.use('/api/auth', authRateLimiter, authRouter);

// Todas as demais rotas da API exigem autenticação válida (somente ADMINISTRADOR ou PROFESSOR)
app.use('/api', apiRateLimiter, authenticate, allowRoles('ADMINISTRADOR', 'PROFESSOR'));
app.use('/api/dashboard', dashboardRouter);
app.use('/api/metadata', metadataRouter);
app.use('/api/occurrences', occurrencesRouter);
app.use('/api/students', studentsRouter);
app.use('/api/teachers', teachersRouter);
app.use('/api/audit', auditRouter);
app.use('/api/notifications', notificationsRouter);

// Redirecionamento SPA / Rota de fallback
if (hasFrontendBuild) {
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.redirect(env.frontendUrl));
}

app.use(notFound);
app.use(errorHandler);

export default app;
