import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ensureRuntimeSchema, pool } from '../config/db.js';

export async function authenticate(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Autenticação necessária.' });
  }

  const token = authorization.slice(7).trim();
  if (!token) {
    return res.status(401).json({ message: 'Token de autenticação ausente.' });
  }

  try {
    await ensureRuntimeSchema();
    const payload = jwt.verify(token, env.jwtSecret, {
      algorithms: ['HS256'],
      issuer: env.jwtIssuer,
      audience: env.jwtAudience
    });

    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: 'Sessão inválida.' });
    }

    const [rows] = await pool.execute(
      `SELECT id, name, email, role, active, token_version AS tokenVersion
       FROM users
       WHERE id = ? AND role IN ('ADMINISTRADOR', 'PROFESSOR')
       LIMIT 1`,
      [userId]
    );
    const user = rows[0];
    if (!user || !user.active) {
      return res.status(401).json({ message: 'Usuário inativo ou não autorizado.' });
    }

    const tokenVersion = Number(payload.tv ?? 0);
    if (tokenVersion !== Number(user.tokenVersion)) {
      return res.status(401).json({ message: 'Sessão revogada. Faça login novamente.' });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };
    return next();
  } catch {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => (
    req.user && roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ message: 'Seu perfil não possui permissão para esta ação.' })
  );
}
