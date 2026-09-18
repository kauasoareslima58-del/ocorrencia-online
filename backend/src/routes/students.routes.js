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
  const like = `%${search}%`;
  const [rows] = await pool.execute(
    `SELECT s.id, s.registration, s.name, s.class_name AS className,
            s.guardian_name AS guardianName, s.guardian_phone AS guardianPhone,
            COUNT(os.occurrence_id) AS occurrenceCount
     FROM students s
     LEFT JOIN occurrence_students os ON os.student_id = s.id
     WHERE s.active = TRUE
       AND (? = '' OR s.name LIKE ? OR s.registration LIKE ? OR s.class_name LIKE ?)
       AND (? = '' OR s.class_name = ?)
     GROUP BY s.id ORDER BY s.name LIMIT 100`,
    [search, like, like, like, className, className]
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
      `INSERT INTO students (registration, name, class_name, guardian_name, guardian_phone)
       VALUES (?, ?, ?, ?, ?)`,
      [registration, name, className, guardianName, guardianPhone]
    );
    await writeAudit(connection, {
      userId: req.user.id,
      action: 'CREATE',
      entity: 'STUDENT',
      entityId: result.insertId,
      details: { registration, className }
    });
    await connection.commit();
    const [[student]] = await pool.execute(
      `SELECT id, registration, name, class_name AS className,
              guardian_name AS guardianName, guardian_phone AS guardianPhone,
              0 AS occurrenceCount FROM students WHERE id = ?`,
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

studentsRouter.get('/:id/history', async (req, res) => {
  const id = Number(req.params.id);
  const [[student]] = await pool.execute(
    `SELECT id, registration, name, class_name AS className, guardian_name AS guardianName,
            guardian_phone AS guardianPhone FROM students WHERE id = ? AND active = TRUE`,
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
