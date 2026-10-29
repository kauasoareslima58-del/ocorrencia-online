import { Router } from 'express';
import { pool } from '../config/db.js';
import { isValidClass } from '../config/classes.js';
import { allowRoles } from '../middleware/auth.js';
import { httpError } from '../middleware/error-handler.js';
import { writeAudit } from '../utils/audit.js';
import { attachStudents, occurrenceSelect } from '../utils/occurrence-queries.js';

export const studentsRouter = Router();
studentsRouter.use(allowRoles('PROFESSOR', 'ADMINISTRADOR'));

studentsRouter.get('/', async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const className = String(req.query.className ?? '').trim();
  const includeInactive = req.query.includeInactive === 'true';
  const like = `%${search}%`;

  const where = [];
  const params = [];

  if (!includeInactive) {
    where.push('s.active = TRUE');
  }

  if (search) {
    where.push('(s.name LIKE ? OR s.registration LIKE ? OR s.class_name LIKE ?)');
    params.push(like, like, like);
  }

  if (className) {
    where.push('s.class_name = ?');
    params.push(className);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT s.id, s.registration, s.name, s.class_name AS className,
            s.guardian_name AS guardianName, s.guardian_phone AS guardianPhone,
            s.active,
            COUNT(os.occurrence_id) AS occurrenceCount
     FROM students s
     LEFT JOIN occurrence_students os ON os.student_id = s.id
     ${whereClause}
     GROUP BY s.id ORDER BY s.name LIMIT 500`,
    params
  );
  res.json(rows);
});

studentsRouter.post('/', allowRoles('ADMINISTRADOR'), async (req, res) => {
  const name = cleanText(req.body?.name, 120);
  const registration = String(req.body?.registration ?? '').trim().toUpperCase();
  const className = cleanText(req.body?.className, 40);
  const guardianName = optionalText(req.body?.guardianName, 120);
  const guardianPhone = optionalText(req.body?.guardianPhone, 30);

  if (name.length < 3) throw httpError(400, 'Informe o nome completo do aluno.');
  if (!/^[A-Z0-9.-]{3,30}$/.test(registration)) throw httpError(400, 'A matrícula deve ter entre 3 e 30 letras ou números.');
  if (!isValidClass(className)) throw httpError(400, 'Selecione uma série entre o 6º Ano e a 3ª Série e uma turma entre A e D.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO students (registration, name, class_name, guardian_name, guardian_phone, active)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [registration, name, className, guardianName, guardianPhone]
    );
    await writeAudit(connection, {
      userId: req.user.id,
      action: 'CREATE',
      entity: 'STUDENT',
      entityId: result.insertId,
      details: { registration, className, name }
    });
    await connection.commit();
    const [[student]] = await pool.execute(
      `SELECT id, registration, name, class_name AS className,
              guardian_name AS guardianName, guardian_phone AS guardianPhone,
              active, 0 AS occurrenceCount FROM students WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json(student);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

studentsRouter.patch('/:id', allowRoles('ADMINISTRADOR'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw httpError(400, 'Identificador inválido.');

  const name = cleanText(req.body?.name, 120);
  const registration = String(req.body?.registration ?? '').trim().toUpperCase();
  const className = cleanText(req.body?.className, 40);
  const guardianName = optionalText(req.body?.guardianName, 120);
  const guardianPhone = optionalText(req.body?.guardianPhone, 30);

  if (name.length < 3) throw httpError(400, 'Informe o nome completo do aluno.');
  if (!/^[A-Z0-9.-]{3,30}$/.test(registration)) throw httpError(400, 'A matrícula deve ter entre 3 e 30 letras ou números.');
  if (!isValidClass(className)) throw httpError(400, 'Selecione uma série entre o 6º Ano e a 3ª Série e uma turma entre A e D.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[student]] = await connection.execute('SELECT id, registration FROM students WHERE id = ? FOR UPDATE', [id]);
    if (!student) throw httpError(404, 'Aluno não encontrado.');

    if (registration !== student.registration) {
      const [[exists]] = await connection.execute('SELECT id FROM students WHERE registration = ? AND id != ?', [registration, id]);
      if (exists) throw httpError(409, 'Já existe outro aluno cadastrado com esta matrícula.');
    }

    await connection.execute(
      `UPDATE students
       SET name = ?, registration = ?, class_name = ?, guardian_name = ?, guardian_phone = ?
       WHERE id = ?`,
      [name, registration, className, guardianName, guardianPhone, id]
    );

    await writeAudit(connection, {
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'STUDENT',
      entityId: id,
      details: { name, registration, className }
    });

    await connection.commit();
    const [[updated]] = await pool.execute(
      `SELECT s.id, s.registration, s.name, s.class_name AS className,
              s.guardian_name AS guardianName, s.guardian_phone AS guardianPhone,
              s.active, COUNT(os.occurrence_id) AS occurrenceCount
       FROM students s
       LEFT JOIN occurrence_students os ON os.student_id = s.id
       WHERE s.id = ? GROUP BY s.id`,
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

studentsRouter.patch('/:id/status', allowRoles('ADMINISTRADOR'), async (req, res) => {
  const id = Number(req.params.id);
  const active = req.body?.active;
  if (!Number.isInteger(id) || typeof active !== 'boolean') throw httpError(400, 'Dados inválidos.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[student]] = await connection.execute('SELECT id, name, active FROM students WHERE id = ? FOR UPDATE', [id]);
    if (!student) throw httpError(404, 'Aluno não encontrado.');

    await connection.execute('UPDATE students SET active = ? WHERE id = ?', [active, id]);

    await writeAudit(connection, {
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'STUDENT',
      entityId: id,
      details: { active, name: student.name }
    });

    await connection.commit();
    res.json({ id, active, message: `Aluno ${active ? 'reativado' : 'inativado'} com sucesso.` });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

studentsRouter.post('/batch', allowRoles('ADMINISTRADOR'), async (req, res) => {
  const items = req.body?.students;
  if (!Array.isArray(items) || !items.length) {
    throw httpError(400, 'Envie uma lista de alunos para importação.');
  }
  if (items.length > 1000) {
    throw httpError(400, 'O limite por importação é de 1000 alunos.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let successCount = 0;
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const name = String(item?.name ?? '').trim().replace(/\s+/g, ' ');
      const registration = String(item?.registration ?? '').trim().toUpperCase();
      const className = String(item?.className ?? '').trim().replace(/\s+/g, ' ');
      const guardianName = String(item?.guardianName ?? '').trim() || null;
      const guardianPhone = String(item?.guardianPhone ?? '').trim() || null;

      if (name.length < 3) {
        errors.push(`Linha ${i + 1}: Nome "${name}" inválido.`);
        continue;
      }
      if (!/^[A-Z0-9.-]{3,30}$/.test(registration)) {
        errors.push(`Linha ${i + 1} (${name}): Matrícula "${registration}" inválida.`);
        continue;
      }
      if (!isValidClass(className)) {
        errors.push(`Linha ${i + 1} (${name}): Turma "${className}" inválida.`);
        continue;
      }

      await connection.execute(
        `INSERT INTO students (registration, name, class_name, guardian_name, guardian_phone, active)
         VALUES (?, ?, ?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           class_name = VALUES(class_name),
           guardian_name = COALESCE(VALUES(guardian_name), guardian_name),
           guardian_phone = COALESCE(VALUES(guardian_phone), guardian_phone),
           active = TRUE`,
        [registration, name, className, guardianName, guardianPhone]
      );
      successCount++;
    }

    await writeAudit(connection, {
      userId: req.user.id,
      action: 'CREATE',
      entity: 'STUDENT',
      details: { action: 'batch_import', processed: items.length, successCount, errorCount: errors.length }
    });

    await connection.commit();
    res.json({
      message: `Importação concluída. ${successCount} aluno(s) processados com sucesso.`,
      successCount,
      errors
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

studentsRouter.get('/:id/history', async (req, res) => {
  const id = Number(req.params.id);
  const [[student]] = await pool.execute(
    `SELECT id, registration, name, class_name AS className, guardian_name AS guardianName,
            guardian_phone AS guardianPhone, active FROM students WHERE id = ?`,
    [id]
  );
  if (!student) return res.status(404).json({ message: 'Aluno não encontrado.' });
  const [rows] = await pool.execute(
    `${occurrenceSelect}
     INNER JOIN occurrence_students selected_os ON selected_os.occurrence_id = o.id
     WHERE selected_os.student_id = ?
     ORDER BY o.occurrence_date DESC, o.occurrence_time DESC, o.id DESC`,
    [id]
  );
  const occurrences = await attachStudents(rows);
  res.json({ student, occurrences });
});

function cleanText(value, maxLength) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (text.length > maxLength) throw httpError(400, `O texto deve ter no máximo ${maxLength} caracteres.`);
  return text;
}

function optionalText(value, maxLength) {
  return cleanText(value, maxLength) || null;
}
