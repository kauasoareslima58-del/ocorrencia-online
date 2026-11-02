import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool } from '../config/db.js';

export async function authenticate(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Autenticação necessária.' });
  }

  try {
    const payload = jwt.verify(authorization.slice(7), env.jwtSecret);
    const userId = Number(payload.sub);
    const [rows] = await pool.execute(
      `SELECT id, role, active FROM users WHERE id = ? AND role IN ('ADMINISTRADOR', 'PROFESSOR') LIMIT 1`,
      [userId]
    );
    const user = rows[0];
    if (!user || !user.active) {
      return res.status(401).json({ message: 'Usuário inativo ou não autorizado.' });
    }

    req.user = {
      id: userId,
      role: user.role
    };
    return next();
  } catch {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ message: 'Seu perfil não possui permissão para esta ação.' });
}
