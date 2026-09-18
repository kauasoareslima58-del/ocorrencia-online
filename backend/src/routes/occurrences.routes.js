import { Router } from 'express';
import { pool } from '../config/db.js';
import { allowRoles } from '../middleware/auth.js';
import { httpError } from '../middleware/error-handler.js';
import { writeAudit } from '../utils/audit.js';
import { attachStudents, getOccurrenceById, occurrenceSelect, roleScope } from '../utils/occurrence-queries.js';

export const occurrencesRouter = Router();
const statuses = new Set(['PENDENTE', 'EM_ANALISE', 'EM_ACOMPANHAMENTO', 'ENCERRADA']);
const priorities = new Set(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']);

occurrencesRouter.get('/', async (req, res) => {
  const scope = roleScope(req.user);
  const where = [scope.sql];
  const params = [...scope.params];
  const search = String(req.query.search ?? '').trim();
  const status = String(req.query.status ?? '').trim();
  const category = String(req.query.category ?? '').trim();
  const professor = String(req.query.professor ?? '').trim();
  const className = String(req.query.className ?? '').trim();
  const startDate = String(req.query.startDate ?? '').trim();
  const endDate = String(req.query.endDate ?? '').trim();

  if (search) {
    const like = `%${search}%`;
    where.push(`(o.protocol LIKE ? OR o.description LIKE ? OR EXISTS (
      SELECT 1 FROM occurrence_students search_os INNER JOIN students search_s ON search_s.id = search_os.student_id
      WHERE search_os.occurrence_id = o.id AND (search_s.name LIKE ? OR search_s.registration LIKE ?)
    ))`);
    params.push(like, like, like, like);
  }
  if (status && statuses.has(status)) { where.push('o.status = ?'); params.push(status); }
  if (category) { where.push('c.name LIKE ?'); params.push(`%${category}%`); }
  if (professor && req.user.role === 'ADMINISTRADOR') { where.push('u.name LIKE ?'); params.push(`%${professor}%`); }
  if (className) {
    where.push(`EXISTS (
      SELECT 1 FROM occurrence_students class_os INNER JOIN students class_s ON class_s.id = class_os.student_id
      WHERE class_os.occurrence_id = o.id AND class_s.class_name = ?
    )`);
    params.push(className);
  }
  if (isDate(startDate)) { where.push('o.occurrence_date >= ?'); params.push(startDate); }
  if (isDate(endDate)) { where.push('o.occurrence_date <= ?'); params.push(endDate); }

  const [rows] = await pool.execute(
    `${occurrenceSelect} WHERE ${where.join(' AND ')}
     ORDER BY o.occurrence_date DESC, o.occurrence_time DESC, o.id DESC LIMIT 500`,
    params
  );
  res.json(await attachStudents(rows, pool, req.user));
});

occurrencesRouter.post('/', allowRoles('PROFESSOR', 'ADMINISTRADOR'), async (req, res) => {
  const studentIds = uniquePositiveIds(req.body?.studentIds);
  const categoryId = Number(req.body?.categoryId);
  const locationId = Number(req.body?.locationId);
  const occurrenceDate = String(req.body?.occurrenceDate ?? '');
  const occurrenceTime = String(req.body?.occurrenceTime ?? '');
  const description = String(req.body?.description ?? '').trim();
  const priority = String(req.body?.priority ?? 'MEDIA');
  if (!studentIds.length) throw httpError(400, 'Selecione pelo menos um aluno.');
  if (!Number.isInteger(categoryId) || !Number.isInteger(locationId)) throw httpError(400, 'Categoria ou local inválido.');
  if (!isDate(occurrenceDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(occurrenceTime)) throw httpError(400, 'Data ou horário inválido.');
  if (description.length < 15 || description.length > 2000) throw httpError(400, 'A descrição deve ter entre 15 e 2000 caracteres.');
  if (!priorities.has(priority)) throw httpError(400, 'Prioridade inválida.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[category], [location], [studentCountRows]] = await Promise.all([
      connection.execute('SELECT id FROM categories WHERE id = ? AND active = TRUE', [categoryId]),
      connection.execute('SELECT id FROM locations WHERE id = ? AND active = TRUE', [locationId]),
      connection.execute(`SELECT COUNT(*) AS total FROM students WHERE active = TRUE AND id IN (${studentIds.map(() => '?').join(',')})`, studentIds)
    ]);
    if (!category.length || !location.length) throw httpError(400, 'Categoria ou local não está disponível.');
    if (studentCountRows[0].total !== studentIds.length) throw httpError(400, 'Um ou mais alunos não foram encontrados.');

    const protocol = generateProtocol();
    const [result] = await connection.execute(
      `INSERT INTO occurrences
       (protocol, occurrence_date, occurrence_time, category_id, location_id, description, status, priority, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?)`,
      [protocol, occurrenceDate, occurrenceTime, categoryId, locationId, description, priority, req.user.id]
    );
    const values = studentIds.map(() => '(?, ?)').join(',');
    const relationParams = studentIds.flatMap((studentId) => [result.insertId, studentId]);
    await connection.execute(`INSERT INTO occurrence_students (occurrence_id, student_id) VALUES ${values}`, relationParams);
    await writeAudit(connection, {
      userId: req.user.id,
      action: 'CREATE',
      entity: 'OCCURRENCE',
      entityId: result.insertId,
      details: { protocol, status: 'PENDENTE', studentIds }
    });
    await connection.commit();
    const occurrence = await getOccurrenceById(result.insertId, req.user);
    res.status(201).json(occurrence);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

occurrencesRouter.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'Identificador inválido.' });
  const occurrence = await getOccurrenceById(id, req.user);
  if (!occurrence) return res.status(404).json({ message: 'Ocorrência não encontrada.' });
  res.json(occurrence);
});

occurrencesRouter.patch('/:id', allowRoles('ADMINISTRADOR'), async (req, res) => {
  const id = Number(req.params.id);
  const categoryId = Number(req.body?.categoryId);
  const locationId = Number(req.body?.locationId);
  const occurrenceDate = String(req.body?.occurrenceDate ?? '');
  const occurrenceTime = String(req.body?.occurrenceTime ?? '');
  const description = String(req.body?.description ?? '').trim();
  const priority = String(req.body?.priority ?? '');
  if (!Number.isInteger(id) || !Number.isInteger(categoryId) || !Number.isInteger(locationId)) throw httpError(400, 'Dados inválidos.');
  if (!isDate(occurrenceDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(occurrenceTime)) throw httpError(400, 'Data ou horário inválido.');
  if (description.length < 15 || description.length > 2000) throw httpError(400, 'A descrição deve ter entre 15 e 2000 caracteres.');
  if (!priorities.has(priority)) throw httpError(400, 'Prioridade inválida.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[occurrenceRows], [categoryRows], [locationRows]] = await Promise.all([
      connection.execute('SELECT id, protocol FROM occurrences WHERE id = ? FOR UPDATE', [id]),
      connection.execute('SELECT id FROM categories WHERE id = ? AND active = TRUE', [categoryId]),
      connection.execute('SELECT id FROM locations WHERE id = ? AND active = TRUE', [locationId])
    ]);
    if (!occurrenceRows.length) throw httpError(404, 'Ocorrência não encontrada.');
    if (!categoryRows.length || !locationRows.length) throw httpError(400, 'Categoria ou local não está disponível.');
    await connection.execute(
      `UPDATE occurrences SET occurrence_date = ?, occurrence_time = ?, category_id = ?, location_id = ?,
       description = ?, priority = ? WHERE id = ?`,
      [occurrenceDate, occurrenceTime, categoryId, locationId, description, priority, id]
    );
    await writeAudit(connection, {
      userId: req.user.id, action: 'UPDATE', entity: 'OCCURRENCE', entityId: id,
      details: { protocol: occurrenceRows[0].protocol, fields: ['occurrenceDate', 'occurrenceTime', 'categoryId', 'locationId', 'description', 'priority'] }
    });
    await connection.commit();
    res.json(await getOccurrenceById(id, req.user));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

occurrencesRouter.post('/:id/updates', allowRoles('ADMINISTRADOR'), async (req, res) => {
  const id = Number(req.params.id);
  const observation = optionalText(req.body?.observation, 1000);
  const actionTaken = optionalText(req.body?.actionTaken, 1000);
  const newStatus = String(req.body?.newStatus ?? '');
  if (!Number.isInteger(id)) throw httpError(400, 'Identificador inválido.');
  if (!statuses.has(newStatus)) throw httpError(400, 'Status inválido.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[occurrence]] = await connection.execute('SELECT id, protocol, status FROM occurrences WHERE id = ? FOR UPDATE', [id]);
    if (!occurrence) throw httpError(404, 'Ocorrência não encontrada.');
    if (!observation && !actionTaken && newStatus === occurrence.status) throw httpError(400, 'Nenhuma alteração foi informada.');

    await connection.execute(
      `INSERT INTO occurrence_updates
       (occurrence_id, observation, action_taken, previous_status, new_status, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, observation, actionTaken, occurrence.status, newStatus, req.user.id]
    );
    await connection.execute('UPDATE occurrences SET status = ? WHERE id = ?', [newStatus, id]);
    await writeAudit(connection, {
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'OCCURRENCE',
      entityId: id,
      details: { protocol: occurrence.protocol, previousStatus: occurrence.status, newStatus, observationAdded: !!observation, actionAdded: !!actionTaken }
    });
    await connection.commit();
    res.json({ message: 'Atualização registrada com sucesso.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

function uniquePositiveIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function optionalText(value, maxLength) {
  const text = String(value ?? '').trim();
  if (text.length > maxLength) throw httpError(400, `O texto deve ter no máximo ${maxLength} caracteres.`);
  return text || null;
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`));
}

function generateProtocol() {
  const year = new Date().getFullYear();
  const time = Date.now().toString(36).slice(-6).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OC-${year}-${time}${random}`;
}
