import { Router } from 'express';
import { pool } from '../config/db.js';
import { allowRoles } from '../middleware/auth.js';
import { httpError } from '../middleware/error-handler.js';
import { writeAudit } from '../utils/audit.js';
import { attachStudents, getOccurrenceById, occurrenceSelect, roleScope } from '../utils/occurrence-queries.js';
import { isValidDate, isValidTime, optionalText, uniquePositiveIds } from '../utils/validators.js';

export const occurrencesRouter = Router();
const statuses = new Set(['PENDENTE', 'EM_ANALISE', 'EM_ACOMPANHAMENTO', 'ENCERRADA']);
const priorities = new Set(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']);

const priorityNames = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente'
};

occurrencesRouter.get('/', async (req, res) => {
  const scope = roleScope(req.user);
  const where = [scope.sql];
  const params = [...scope.params];

  const search = String(req.query.search ?? '').trim();
  const status = String(req.query.status ?? '').trim();
  const priority = String(req.query.priority ?? '').trim();
  const category = String(req.query.category ?? '').trim();
  const categoryId = Number(req.query.categoryId);
  const professor = String(req.query.professor ?? '').trim();
  const professorId = Number(req.query.professorId);
  const className = String(req.query.className ?? '').trim();
  const studentId = Number(req.query.studentId);
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
  if (status && statuses.has(status)) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (priority && priorities.has(priority)) {
    where.push('o.priority = ?');
    params.push(priority);
  }
  if (Number.isInteger(categoryId) && categoryId > 0) {
    where.push('o.category_id = ?');
    params.push(categoryId);
  } else if (category) {
    where.push('c.name LIKE ?');
    params.push(`%${category}%`);
  }
  if (req.user.role === 'ADMINISTRADOR') {
    if (Number.isInteger(professorId) && professorId > 0) {
      where.push('o.created_by = ?');
      params.push(professorId);
    } else if (professor) {
      where.push('u.name LIKE ?');
      params.push(`%${professor}%`);
    }
  }
  if (Number.isInteger(studentId) && studentId > 0) {
    where.push(`EXISTS (
      SELECT 1 FROM occurrence_students st_os
      WHERE st_os.occurrence_id = o.id AND st_os.student_id = ?
    )`);
    params.push(studentId);
  }
  if (className) {
    where.push(`EXISTS (
      SELECT 1 FROM occurrence_students class_os INNER JOIN students class_s ON class_s.id = class_os.student_id
      WHERE class_os.occurrence_id = o.id AND class_s.class_name = ?
    )`);
    params.push(className);
  }
  if (isValidDate(startDate)) {
    where.push('o.occurrence_date >= ?');
    params.push(startDate);
  }
  if (isValidDate(endDate)) {
    where.push('o.occurrence_date <= ?');
    params.push(endDate);
  }

  const pageParam = Number(req.query.page);
  const limitParam = Number(req.query.limit);
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const limit = Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 500 ? limitParam : 20;
  const offset = (page - 1) * limit;

  const [countRows] = await pool.execute(
    `SELECT COUNT(DISTINCT o.id) AS total
     FROM occurrences o
     INNER JOIN categories c ON c.id = o.category_id
     INNER JOIN locations l ON l.id = o.location_id
     INNER JOIN users u ON u.id = o.created_by
     WHERE ${where.join(' AND ')}`,
    params
  );
  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.ceil(total / limit) || 1;

  const [rows] = await pool.execute(
    `${occurrenceSelect} WHERE ${where.join(' AND ')}
     ORDER BY o.occurrence_date DESC, o.occurrence_time DESC, o.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  const items = await attachStudents(rows, pool);

  res.json({
    items,
    total,
    page,
    limit,
    totalPages
  });
});

occurrencesRouter.post('/', allowRoles('PROFESSOR', 'ADMINISTRADOR'), async (req, res) => {
  const studentIds = uniquePositiveIds(req.body?.studentIds);
  const categoryId = Number(req.body?.categoryId);
  const locationId = Number(req.body?.locationId);
  const occurrenceDate = String(req.body?.occurrenceDate ?? '').trim();
  const occurrenceTime = String(req.body?.occurrenceTime ?? '').trim();
  const description = String(req.body?.description ?? '').trim();
  const priority = String(req.body?.priority ?? 'MEDIA').trim();

  if (!studentIds.length) throw httpError(400, 'Selecione pelo menos um aluno.');
  if (!Number.isInteger(categoryId) || categoryId <= 0 || !Number.isInteger(locationId) || locationId <= 0) {
    throw httpError(400, 'Categoria ou local inválido.');
  }
  if (!isValidDate(occurrenceDate) || !isValidTime(occurrenceTime)) {
    throw httpError(400, 'Data ou horário inválido.');
  }
  if (description.length < 15 || description.length > 2000) {
    throw httpError(400, 'A descrição deve ter entre 15 e 2000 caracteres.');
  }
  if (!priorities.has(priority)) throw httpError(400, 'Prioridade inválida.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[category], [location], [studentCountRows]] = await Promise.all([
      connection.execute('SELECT id FROM categories WHERE id = ? AND active = TRUE', [categoryId]),
      connection.execute('SELECT id FROM locations WHERE id = ? AND active = TRUE', [locationId]),
      connection.execute(
        `SELECT COUNT(*) AS total FROM students WHERE active = TRUE AND id IN (${studentIds.map(() => '?').join(',')})`,
        studentIds
      )
    ]);
    if (!category.length || !location.length) {
      throw httpError(400, 'Categoria ou local não está disponível.');
    }
    if (Number(studentCountRows[0].total) !== studentIds.length) {
      throw httpError(400, 'Um ou mais alunos selecionados estão inativos ou não foram encontrados.');
    }

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
      details: { protocol, status: 'PENDENTE', priority, studentIds }
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
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }
  const occurrence = await getOccurrenceById(id, req.user);
  if (!occurrence) return res.status(404).json({ message: 'Ocorrência não encontrada.' });
  return res.json(occurrence);
});

occurrencesRouter.patch('/:id', allowRoles('ADMINISTRADOR', 'PROFESSOR'), async (req, res) => {
  const id = Number(req.params.id);
  const categoryId = Number(req.body?.categoryId);
  const locationId = Number(req.body?.locationId);
  const occurrenceDate = String(req.body?.occurrenceDate ?? '').trim();
  const occurrenceTime = String(req.body?.occurrenceTime ?? '').trim();
  const description = String(req.body?.description ?? '').trim();
  const priority = String(req.body?.priority ?? '').trim();
  const hasStudentIds = Array.isArray(req.body?.studentIds);
  const studentIds = hasStudentIds ? uniquePositiveIds(req.body.studentIds) : [];

  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(categoryId) || categoryId <= 0 || !Number.isInteger(locationId) || locationId <= 0) {
    throw httpError(400, 'Dados inválidos.');
  }
  if (hasStudentIds && !studentIds.length) throw httpError(400, 'Selecione pelo menos um aluno.');
  if (!isValidDate(occurrenceDate) || !isValidTime(occurrenceTime)) {
    throw httpError(400, 'Data ou horário inválido.');
  }
  if (description.length < 15 || description.length > 2000) {
    throw httpError(400, 'A descrição deve ter entre 15 e 2000 caracteres.');
  }
  if (!priorities.has(priority)) throw httpError(400, 'Prioridade inválida.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[occurrenceRows], [categoryRows], [locationRows], [currentStudentsRows]] = await Promise.all([
      connection.execute(
        `SELECT o.id, o.protocol, o.occurrence_date AS occurrenceDate, o.occurrence_time AS occurrenceTime,
                o.category_id AS categoryId, c.name AS categoryName,
                o.location_id AS locationId, l.name AS locationName,
                o.description, o.priority, o.created_by AS createdBy, o.status
         FROM occurrences o
         INNER JOIN categories c ON c.id = o.category_id
         INNER JOIN locations l ON l.id = o.location_id
         WHERE o.id = ? FOR UPDATE`,
        [id]
      ),
      connection.execute('SELECT id, name FROM categories WHERE id = ? AND active = TRUE', [categoryId]),
      connection.execute('SELECT id, name FROM locations WHERE id = ? AND active = TRUE', [locationId]),
      connection.execute('SELECT student_id AS studentId FROM occurrence_students WHERE occurrence_id = ?', [id])
    ]);

    if (!occurrenceRows.length) throw httpError(404, 'Ocorrência não encontrada.');
    const occurrence = occurrenceRows[0];

    if (req.user.role === 'PROFESSOR') {
      if (occurrence.createdBy !== req.user.id) {
        throw httpError(403, 'Você só pode editar ocorrências que você registrou.');
      }
      if (occurrence.status !== 'PENDENTE') {
        throw httpError(403, 'A ocorrência já está em análise e só pode ser alterada pela coordenação.');
      }
    }

    if (!categoryRows.length || !locationRows.length) {
      throw httpError(400, 'Categoria ou local não está disponível.');
    }

    const currentStudentIds = currentStudentsRows.map((r) => Number(r.studentId)).sort((a, b) => a - b);
    const currentStudentSet = new Set(currentStudentIds);
    let studentsChanged = false;

    if (hasStudentIds) {
      const sortedNew = [...studentIds].sort((a, b) => a - b);
      studentsChanged = sortedNew.length !== currentStudentIds.length
        || sortedNew.some((sid, idx) => sid !== currentStudentIds[idx]);

      if (studentsChanged) {
        const [studentRows] = await connection.execute(
          `SELECT id, active FROM students WHERE id IN (${studentIds.map(() => '?').join(',')})`,
          studentIds
        );
        if (studentRows.length !== studentIds.length) {
          throw httpError(400, 'Um ou mais alunos selecionados não foram encontrados.');
        }
        const newlyAddedInactive = studentRows.find((s) => !s.active && !currentStudentSet.has(Number(s.id)));
        if (newlyAddedInactive) {
          throw httpError(400, 'Não é possível adicionar um aluno inativo à ocorrência.');
        }

        await connection.execute('DELETE FROM occurrence_students WHERE occurrence_id = ?', [id]);
        const values = studentIds.map(() => '(?, ?)').join(',');
        const relationParams = studentIds.flatMap((studentId) => [id, studentId]);
        await connection.execute(`INSERT INTO occurrence_students (occurrence_id, student_id) VALUES ${values}`, relationParams);
      }
    }

    const changes = [];
    const oldDate = String(occurrence.occurrenceDate).slice(0, 10);
    const oldTime = String(occurrence.occurrenceTime).slice(0, 5);
    if (oldDate !== occurrenceDate || oldTime !== occurrenceTime) {
      changes.push(`Data/horário (${oldDate} ${oldTime} → ${occurrenceDate} ${occurrenceTime})`);
    }
    if (Number(occurrence.categoryId) !== categoryId) {
      changes.push(`Categoria (${occurrence.categoryName} → ${categoryRows[0].name})`);
    }
    if (Number(occurrence.locationId) !== locationId) {
      changes.push(`Local (${occurrence.locationName} → ${locationRows[0].name})`);
    }
    if (occurrence.priority !== priority) {
      changes.push(`Prioridade (${priorityNames[occurrence.priority] ?? occurrence.priority} → ${priorityNames[priority] ?? priority})`);
    }
    if (occurrence.description !== description) {
      changes.push('Descrição atualizada');
    }
    if (studentsChanged) {
      changes.push(`Alunos envolvidos atualizados (${studentIds.length} aluno(s))`);
    }

    await connection.execute(
      `UPDATE occurrences
       SET occurrence_date = ?, occurrence_time = ?, category_id = ?, location_id = ?,
           description = ?, priority = ?
       WHERE id = ?`,
      [occurrenceDate, occurrenceTime, categoryId, locationId, description, priority, id]
    );

    if (changes.length) {
      const summary = `Dados da ocorrência editados: ${changes.join('; ')}.`.slice(0, 1000);
      await connection.execute(
        `INSERT INTO occurrence_updates
         (occurrence_id, observation, action_taken, previous_status, new_status, created_by)
         VALUES (?, ?, NULL, ?, ?, ?)`,
        [id, summary, occurrence.status, occurrence.status, req.user.id]
      );
    }

    const updatedFields = ['occurrenceDate', 'occurrenceTime', 'categoryId', 'locationId', 'description', 'priority'];
    if (studentsChanged) updatedFields.push('studentIds');

    await writeAudit(connection, {
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'OCCURRENCE',
      entityId: id,
      details: {
        protocol: occurrence.protocol,
        changes,
        fields: updatedFields,
        ...(studentsChanged ? { studentIds } : {})
      }
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

occurrencesRouter.post('/:id/updates', allowRoles('ADMINISTRADOR', 'PROFESSOR'), async (req, res) => {
  const id = Number(req.params.id);
  const observation = optionalText(req.body?.observation, 1000);
  const actionTaken = optionalText(req.body?.actionTaken, 1000);
  const requestedStatus = String(req.body?.newStatus ?? '').trim();

  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Identificador inválido.');
  if (requestedStatus && !statuses.has(requestedStatus)) {
    throw httpError(400, 'Status informado é inválido.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[occurrence]] = await connection.execute(
      'SELECT id, protocol, status, created_by AS createdBy FROM occurrences WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!occurrence) throw httpError(404, 'Ocorrência não encontrada.');

    if (req.user.role === 'PROFESSOR') {
      if (occurrence.createdBy !== req.user.id) {
        throw httpError(403, 'Professores só podem registrar acompanhamento nas ocorrências que criaram.');
      }
      if (occurrence.status === 'ENCERRADA') {
        throw httpError(403, 'Esta ocorrência já foi encerrada. Apenas a coordenação pode reabri-la ou adicionar novas providências.');
      }
      if (requestedStatus && requestedStatus !== occurrence.status) {
        throw httpError(403, 'Apenas a coordenação pode alterar o status da ocorrência.');
      }
    }

    const statusToApply = req.user.role === 'ADMINISTRADOR' && requestedStatus && statuses.has(requestedStatus)
      ? requestedStatus
      : occurrence.status;

    if (!observation && !actionTaken && statusToApply === occurrence.status) {
      throw httpError(400, 'Informe uma observação, uma providência ou altere o status.');
    }

    await connection.execute(
      `INSERT INTO occurrence_updates
       (occurrence_id, observation, action_taken, previous_status, new_status, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, observation, actionTaken, occurrence.status, statusToApply, req.user.id]
    );

    if (statusToApply !== occurrence.status) {
      await connection.execute('UPDATE occurrences SET status = ? WHERE id = ?', [statusToApply, id]);
    }

    await writeAudit(connection, {
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'OCCURRENCE',
      entityId: id,
      details: {
        protocol: occurrence.protocol,
        previousStatus: occurrence.status,
        newStatus: statusToApply,
        observationAdded: Boolean(observation),
        actionAdded: Boolean(actionTaken)
      }
    });

    await connection.commit();
    const updatedOccurrence = await getOccurrenceById(id, req.user);
    res.json({ message: 'Atualização registrada com sucesso.', occurrence: updatedOccurrence });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

function generateProtocol() {
  const year = new Date().getFullYear();
  const time = Date.now().toString(36).slice(-6).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OC-${year}-${time}${random}`;
}
