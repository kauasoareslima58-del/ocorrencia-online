import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { allowRoles } from '../middleware/auth.js';
import { httpError } from '../middleware/error-handler.js';
import { writeAudit } from '../utils/audit.js';
import { cleanText, isStrongPassword, isValidEmail } from '../utils/validators.js';

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
     ORDER BY u.active DESC, u.name ASC`
  );
  res.json(rows);
});

teachersRouter.post('/', async (req, res) => {
  const name = cleanText(req.body?.name, 120);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (name.length < 3) throw httpError(400, 'Informe o nome completo do professor.');
  if (!isValidEmail(email)) throw httpError(400, 'Informe um e-mail válido.');
  if (!isStrongPassword(password)) {
    throw httpError(400, 'A senha deve ter 8 a 72 caracteres, com maiúscula, minúscula, número e símbolo.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO users (name, email, password_hash, role, active, token_version)
       VALUES (?, ?, ?, 'PROFESSOR', TRUE, 1)`,
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

teachersRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Identificador inválido.');

  const name = cleanText(req.body?.name, 120);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (name.length < 3) throw httpError(400, 'Informe o nome completo do professor.');
  if (!isValidEmail(email)) throw httpError(400, 'Informe um e-mail válido.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[teacher]] = await connection.execute(
      `SELECT id, email FROM users WHERE id = ? AND role = 'PROFESSOR' FOR UPDATE`,
      [id]
    );
    if (!teacher) throw httpError(404, 'Professor não encontrado.');

    if (email !== teacher.email) {
      const [[exists]] = await connection.execute('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [email, id]);
      if (exists) throw httpError(409, 'Já existe outro usuário cadastrado com este e-mail.');
    }

    await connection.execute('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, id]);
    await writeAudit(connection, {
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'TEACHER',
      entityId: id,
      details: { name, email }
    });
    await connection.commit();

    const [[updated]] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.active, u.created_at AS createdAt,
              COUNT(o.id) AS occurrenceCount
       FROM users u
       LEFT JOIN occurrences o ON o.created_by = u.id
       WHERE u.id = ? GROUP BY u.id`,
      [id]
    );
    res.json(updated);
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
  if (!Number.isInteger(id) || id <= 0 || typeof active !== 'boolean') {
    throw httpError(400, 'Dados inválidos.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[teacher]] = await connection.execute(
      `SELECT id, name, email FROM users WHERE id = ? AND role = 'PROFESSOR' FOR UPDATE`,
      [id]
    );
    if (!teacher) throw httpError(404, 'Professor não encontrado.');

    // Ao desativar, incrementa token_version para revogar sessões imediatamente
    await connection.execute(
      'UPDATE users SET active = ?, token_version = token_version + IF(? = FALSE, 1, 0) WHERE id = ?',
      [active, active, id]
    );

    await writeAudit(connection, {
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'TEACHER',
      entityId: id,
      details: { name: teacher.name, email: teacher.email, active }
    });
    await connection.commit();

    const [[updated]] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.active, u.created_at AS createdAt,
              COUNT(o.id) AS occurrenceCount
       FROM users u
       LEFT JOIN occurrences o ON o.created_by = u.id
       WHERE u.id = ? GROUP BY u.id`,
      [id]
    );
    res.json(updated);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

teachersRouter.post('/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  const newPassword = String(req.body?.newPassword ?? '');
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Identificador inválido.');
  if (!isStrongPassword(newPassword)) {
    throw httpError(400, 'A nova senha deve ter 8 a 72 caracteres, com maiúscula, minúscula, número e símbolo.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, name, email FROM users WHERE id = ? AND role = 'PROFESSOR' FOR UPDATE`,
      [id]
    );
    const teacher = rows[0];
    if (!teacher) throw httpError(404, 'Professor não encontrado.');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await connection.execute(
      'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
      [passwordHash, id]
    );

    await writeAudit(connection, {
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'TEACHER',
      entityId: id,
      details: { action: 'reset_password', teacherName: teacher.name, teacherEmail: teacher.email }
    });
    await connection.commit();

    res.json({ message: `Senha do professor ${teacher.name} redefinida com sucesso.` });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
