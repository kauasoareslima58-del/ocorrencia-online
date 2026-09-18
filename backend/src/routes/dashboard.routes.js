import { Router } from 'express';
import { pool } from '../config/db.js';
import { attachStudents, occurrenceSelect, roleScope } from '../utils/occurrence-queries.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  const scope = roleScope(req.user);
  const [totalsRows] = await pool.execute(
    `SELECT COUNT(*) AS allCount,
            COALESCE(SUM(status = 'PENDENTE'), 0) AS pending,
            COALESCE(SUM(status = 'EM_ANALISE'), 0) AS analysis,
            COALESCE(SUM(status = 'EM_ACOMPANHAMENTO'), 0) AS monitoring,
            COALESCE(SUM(status = 'ENCERRADA'), 0) AS closed
     FROM occurrences o WHERE ${scope.sql}`,
    scope.params
  );
  const [byCategory] = await pool.execute(
    `SELECT c.name, COUNT(*) AS total FROM occurrences o
     INNER JOIN categories c ON c.id = o.category_id
     WHERE ${scope.sql} GROUP BY c.id, c.name ORDER BY total DESC`,
    scope.params
  );
  const [recentRows] = await pool.execute(
    `${occurrenceSelect} WHERE ${scope.sql} ORDER BY o.occurrence_date DESC, o.occurrence_time DESC, o.id DESC LIMIT 6`,
    scope.params
  );
  const recent = await attachStudents(recentRows, pool, req.user);
  const row = totalsRows[0];
  res.json({
    totals: { all: row.allCount, pending: row.pending, analysis: row.analysis, monitoring: row.monitoring, closed: row.closed },
    byCategory,
    recent
  });
});
