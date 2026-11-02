import { Router } from 'express';
import { pool } from '../config/db.js';
import { attachStudents, occurrenceSelect, roleScope } from '../utils/occurrence-queries.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  const scope = roleScope(req.user);
  const [totalsResult, categoriesResult, classesResult, recentResult] = await Promise.all([
    pool.execute(
      `SELECT COUNT(*) AS allCount,
              COALESCE(SUM(status = 'PENDENTE'), 0) AS pending,
              COALESCE(SUM(status = 'EM_ANALISE'), 0) AS analysis,
              COALESCE(SUM(status = 'EM_ACOMPANHAMENTO'), 0) AS monitoring,
              COALESCE(SUM(status = 'ENCERRADA'), 0) AS closed
       FROM occurrences o WHERE ${scope.sql}`,
      scope.params
    ),
    pool.execute(
      `SELECT c.name, COUNT(*) AS total FROM occurrences o
       INNER JOIN categories c ON c.id = o.category_id
       WHERE ${scope.sql} GROUP BY c.id, c.name ORDER BY total DESC`,
      scope.params
    ),
    pool.execute(
      `SELECT s.class_name AS name, COUNT(DISTINCT o.id) AS total
       FROM occurrences o
       INNER JOIN occurrence_students os ON os.occurrence_id = o.id
       INNER JOIN students s ON s.id = os.student_id
       WHERE ${scope.sql}
       GROUP BY s.class_name
       ORDER BY total DESC, s.class_name ASC
       LIMIT 8`,
      scope.params
    ),
    pool.execute(
      `${occurrenceSelect} WHERE ${scope.sql} ORDER BY o.occurrence_date DESC, o.occurrence_time DESC, o.id DESC LIMIT 6`,
      scope.params
    )
  ]);
  const [totalsRows] = totalsResult;
  const [byCategory] = categoriesResult;
  const [byClass] = classesResult;
  const [recentRows] = recentResult;
  const recent = await attachStudents(recentRows, pool, req.user);
  const row = totalsRows[0];
  res.json({
    totals: { all: row.allCount, pending: row.pending, analysis: row.analysis, monitoring: row.monitoring, closed: row.closed },
    byCategory,
    byClass,
    recent
  });
});
