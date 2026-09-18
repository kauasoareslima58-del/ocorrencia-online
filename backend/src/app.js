import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === env.frontendUrl) return callback(null, true);
    return callback(new Error('Origem não autorizada.'));
  },
  credentials: false
}));
app.use(express.json({ limit: '100kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }), authRouter);
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', authenticate);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/metadata', metadataRouter);
app.use('/api/occurrences', occurrencesRouter);
app.use('/api/students', studentsRouter);
app.use('/api/teachers', teachersRouter);
app.use('/api/audit', auditRouter);
app.use(notFound);
app.use(errorHandler);
