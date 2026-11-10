import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import { authenticate } from './middleware/auth.js';
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
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === env.frontendUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || !env.isProduction) {
      return callback(null, true);
    }
    return callback(null, true); // Permite acessos via túnel / produção
  },
  credentials: false
}));

app.use(express.json({ limit: '100kb' }));

// Servir frontend compilado se existir
if (hasFrontendBuild) {
  app.use(express.static(frontendDist));
}

// Rotas da API
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-8', legacyHeaders: false }), authRouter);
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', authenticate);
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
