import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { writeAudit } from '../utils/audit.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) return res.status(400).json({ message: 'Informe e-mail e senha.' });

  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.password_hash AS passwordHash, u.role, s.id AS studentId
     FROM users u LEFT JOIN students s ON s.user_id = u.id
     WHERE u.email = ? AND u.active = TRUE LIMIT 1`,
    [email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
  }

  const token = jwt.sign(
    { role: user.role, studentId: user.studentId ?? null },
    env.jwtSecret,
    { subject: String(user.id), expiresIn: env.jwtExpiresIn, issuer: 'ocorrencia-online' }
  );
  await writeAudit(pool, { userId: user.id, action: 'LOGIN', entity: 'AUTH', details: { result: 'success' } });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, studentId: user.studentId ?? null } });
});

