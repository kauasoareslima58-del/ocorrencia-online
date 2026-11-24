import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { ensureRuntimeSchema, pool } from '../config/db.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';
import { isStrongPassword, isValidEmail } from '../utils/validators.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Muitas tentativas de login sem sucesso. Aguarde alguns minutos e tente novamente.' }
});

function issueToken(user) {
  return jwt.sign(
    {
      role: user.role,
      tv: Number(user.tokenVersion ?? 1)
    },
    env.jwtSecret,
    {
      algorithm: 'HS256',
      subject: String(user.id),
      expiresIn: env.jwtExpiresIn,
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      jwtid: crypto.randomUUID()
    }
  );
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  await ensureRuntimeSchema();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!email || !password) {
    return res.status(400).json({ message: 'Informe e-mail e senha.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Informe um e-mail válido.' });
  }

  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.password_hash AS passwordHash,
            u.role, u.active, u.token_version AS tokenVersion
     FROM users u
     WHERE u.email = ? AND u.role IN ('ADMINISTRADOR', 'PROFESSOR')
     LIMIT 1`,
    [email]
  );
  const user = rows[0];

  if (!user) {
    return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
  }

  if (!user.active) {
    await writeAudit(pool, {
      userId: user.id,
      action: 'LOGIN_FAILED',
      entity: 'AUTH',
      details: { reason: 'inactive_account' }
    });
    return res.status(403).json({ message: 'Conta desativada. Procure a coordenação da escola.' });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    await writeAudit(pool, {
      userId: user.id,
      action: 'LOGIN_FAILED',
      entity: 'AUTH',
      details: { reason: 'invalid_password' }
    });
    return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
  }

  const token = issueToken(user);
  await writeAudit(pool, { userId: user.id, action: 'LOGIN', entity: 'AUTH', details: { result: 'success' } });
  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

authRouter.get('/me', authenticate, async (req, res) => {
  return res.json({ user: req.user });
});

authRouter.post('/change-password', authenticate, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Informe a senha atual e a nova senha.' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ message: 'A nova senha deve ser diferente da senha atual.' });
  }

  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({
      message: 'A nova senha deve ter entre 8 e 72 caracteres, contendo letra maiúscula, minúscula, número e símbolo.'
    });
  }

  const [rows] = await pool.execute(
    `SELECT id, name, email, role, password_hash AS passwordHash, token_version AS tokenVersion
     FROM users WHERE id = ? LIMIT 1`,
    [req.user.id]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(400).json({ message: 'Senha atual incorreta.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const nextTokenVersion = Number(user.tokenVersion ?? 1) + 1;

  await pool.execute(
    'UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?',
    [passwordHash, nextTokenVersion, req.user.id]
  );

  await writeAudit(pool, {
    userId: req.user.id,
    action: 'UPDATE',
    entity: 'USER',
    entityId: req.user.id,
    details: { action: 'change_password' }
  });

  const token = issueToken({ ...user, tokenVersion: nextTokenVersion });
  return res.json({
    message: 'Senha alterada com sucesso.',
    token
  });
});
