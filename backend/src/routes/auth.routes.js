import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) return res.status(400).json({ message: 'Informe e-mail e senha.' });

  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.password_hash AS passwordHash, u.role
     FROM users u
     WHERE u.email = ? AND u.active = TRUE AND u.role IN ('ADMINISTRADOR', 'PROFESSOR') LIMIT 1`,
    [email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
  }

  const token = jwt.sign(
    { role: user.role },
    env.jwtSecret,
    { subject: String(user.id), expiresIn: env.jwtExpiresIn, issuer: 'ocorrencia-online' }
  );
  await writeAudit(pool, { userId: user.id, action: 'LOGIN', entity: 'AUTH', details: { result: 'success' } });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

authRouter.post('/change-password', authenticate, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Informe a senha atual e a nova senha.' });
  }

  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({
      message: 'A nova senha deve ter entre 8 e 72 caracteres, contendo letra maiúscula, minúscula, número e símbolo.'
    });
  }

  const [rows] = await pool.execute('SELECT password_hash AS passwordHash FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(400).json({ message: 'Senha atual incorreta.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);

  await writeAudit(pool, {
    userId: req.user.id,
    action: 'UPDATE',
    entity: 'USER',
    entityId: req.user.id,
    details: { action: 'change_password' }
  });

  res.json({ message: 'Senha alterada com sucesso.' });
});

function isStrongPassword(password) {
  return password.length >= 8 && password.length <= 72
    && /[a-z]/.test(password) && /[A-Z]/.test(password)
    && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}
