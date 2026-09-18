import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { allowRoles } from '../middleware/auth.js';
import { httpError } from '../middleware/error-handler.js';
import { writeAudit } from '../utils/audit.js';

export const teachersRouter = Router();
teachersRouter.use(allowRoles('ADMINISTRADOR'));

teachersRouter.get('/', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.active, u.created_at AS createdAt,
            COUNT(o.id) AS occurrenceCount
     FROM users u
     LEFT JOIN occurrences o ON o.created_by = u.id
     WHERE u.role = 'PROFESSOR'
     GROUP BY u.id
     ORDER BY u.active DESC, u.name`
  );
  res.json(rows);
});

teachersRouter.post('/', async (req, res) => {
  const name = cleanText(req.body?.name, 120);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (name.length < 3) throw httpError(400, 'Informe o nome completo do professor.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) throw httpError(400, 'Informe um e-mail válido.');
  if (!isStrongPassword(password)) {
    throw httpError(400, 'A senha deve ter 8 a 72 caracteres, com maiúscula, minúscula, número e símbolo.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO users (name, email, password_hash, role, active)
       VALUES (?, ?, ?, 'PROFESSOR', TRUE)`,
      [name, email, passwordHash]
    );
    await writeAudit(connection, {
      userId: req.user.id,
      action: 'CREATE',
      entity: 'TEACHER',
      entityId: result.insertId,
      details: { name, email }
    });
    await connection.commit();
    const [[teacher]] = await pool.execute(
      `SELECT id, name, email, active, created_at AS createdAt, 0 AS occurrenceCount
       FROM users WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json(teacher);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

teachersRouter.patch('/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const active = req.body?.active;
  if (!Number.isInteger(id) || typeof active !== 'boolean') throw httpError(400, 'Dados inválidos.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[teacher]] = await connection.execute(
      `SELECT id, name, email FROM users WHERE id = ? AND role = 'PROFESSOR' FOR UPDATE`,
      [id]
    );
    if (!teacher) throw httpError(404, 'Professor não encontrado.');
    await connection.execute('UPDATE users SET active = ? WHERE id = ?', [active, id]);
    await writeAudit(connection, {
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'TEACHER',
      entityId: id,
      details: { name: teacher.name, email: teacher.email, active }
    });
    await connection.commit();
    res.json({ ...teacher, active, occurrenceCount: 0 });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

function cleanText(value, maxLength) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (text.length > maxLength) throw httpError(400, `O texto deve ter no máximo ${maxLength} caracteres.`);
  return text;
}

function isStrongPassword(password) {
  return password.length >= 8 && password.length <= 72
    && /[a-z]/.test(password) && /[A-Z]/.test(password)
    && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}
