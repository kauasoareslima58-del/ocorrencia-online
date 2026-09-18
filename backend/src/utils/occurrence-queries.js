import { pool } from '../config/db.js';

export const occurrenceSelect = `
  SELECT o.id, o.protocol, o.occurrence_date AS occurrenceDate, o.occurrence_time AS occurrenceTime,
         o.description, o.status, o.priority, o.category_id AS categoryId, c.name AS categoryName,
         o.location_id AS locationId, l.name AS locationName, o.created_by AS createdBy,
         u.name AS professorName, o.created_at AS createdAt, o.updated_at AS updatedAt
  FROM occurrences o
  INNER JOIN categories c ON c.id = o.category_id
  INNER JOIN locations l ON l.id = o.location_id
  INNER JOIN users u ON u.id = o.created_by`;

export function roleScope(user, alias = 'o') {
  if (user.role === 'ADMINISTRADOR') return { sql: '1 = 1', params: [] };
  if (user.role === 'PROFESSOR') return { sql: `${alias}.created_by = ?`, params: [user.id] };
  return {
    sql: `EXISTS (SELECT 1 FROM occurrence_students scope_os WHERE scope_os.occurrence_id = ${alias}.id AND scope_os.student_id = ?)`,
    params: [user.studentId ?? 0]
  };
}

export async function attachStudents(rows, runner = pool, user = null) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(',');
  const [students] = await runner.execute(
    `SELECT os.occurrence_id AS occurrenceId, s.id, s.registration, s.name, s.class_name AS className,
            s.guardian_name AS guardianName, s.guardian_phone AS guardianPhone
     FROM occurrence_students os
     INNER JOIN students s ON s.id = os.student_id
     WHERE os.occurrence_id IN (${placeholders}) ORDER BY s.name`,
    ids
  );
  const grouped = new Map();
  for (const student of students) {
    const list = grouped.get(student.occurrenceId) ?? [];
    list.push({
      id: student.id,
      registration: student.registration,
      name: student.name,
      className: student.className,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone
    });
    grouped.set(student.occurrenceId, list);
  }
  return rows.map((row) => {
    let visibleStudents = grouped.get(row.id) ?? [];
    if (user?.role === 'ALUNO') {
      visibleStudents = visibleStudents
        .filter((student) => student.id === user.studentId)
        .map(({ id, registration, name, className }) => ({ id, registration, name, className }));
    }
    return { ...row, students: visibleStudents };
  });
}

export async function getOccurrenceById(id, user, runner = pool) {
  const scope = roleScope(user);
  const [rows] = await runner.execute(`${occurrenceSelect} WHERE o.id = ? AND ${scope.sql}`, [id, ...scope.params]);
  if (!rows.length) return null;
  const [withStudents] = await attachStudents(rows, runner, user);
  const [updates] = await runner.execute(
    `SELECT ou.id, ou.observation, ou.action_taken AS actionTaken,
            ou.previous_status AS previousStatus, ou.new_status AS newStatus,
            u.name AS authorName, u.role AS authorRole, ou.created_at AS createdAt
     FROM occurrence_updates ou
     INNER JOIN users u ON u.id = ou.created_by
     WHERE ou.occurrence_id = ? ORDER BY ou.created_at DESC, ou.id DESC`,
    [id]
  );
  return { ...withStudents, updates };
}
