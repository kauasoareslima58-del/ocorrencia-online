import { Router } from 'express';
import { pool } from '../config/db.js';
import { attachStudents, occurrenceSelect, roleScope } from '../utils/occurrence-queries.js';

export const dashboardRouter = Router();

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function getLastSixMonths() {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const label = `${MONTH_NAMES[month - 1]}/${String(year).slice(-2)}`;
    months.push({ month: key, label });
  }
  return months;
}

dashboardRouter.get('/', async (req, res) => {
  const scope = roleScope(req.user);
  const isAdmin = req.user.role === 'ADMINISTRADOR';
  const lastSixMonths = getLastSixMonths();
  const firstMonthStart = `${lastSixMonths[0].month}-01`;

  const [
    totalsResult,
    categoriesResult,
    classesResult,
    monthlyResult,
    priorityResult,
    resolutionResult,
    studentsCountResult,
    teachersCountResult,
    recentResult
  ] = await Promise.all([
    pool.execute(
      `SELECT COUNT(*) AS allCount,
              COALESCE(SUM(o.status = 'PENDENTE'), 0) AS pending,
              COALESCE(SUM(o.status = 'EM_ANALISE'), 0) AS analysis,
              COALESCE(SUM(o.status = 'EM_ACOMPANHAMENTO'), 0) AS monitoring,
              COALESCE(SUM(o.status = 'ENCERRADA'), 0) AS closed,
              COALESCE(SUM(o.status != 'ENCERRADA' AND o.priority IN ('ALTA', 'URGENTE')), 0) AS urgentOpen
       FROM occurrences o WHERE ${scope.sql}`,
      scope.params
    ),
    pool.execute(
      `SELECT c.name, COUNT(*) AS total
       FROM occurrences o
       INNER JOIN categories c ON c.id = o.category_id
       WHERE ${scope.sql}
       GROUP BY c.id, c.name
       ORDER BY total DESC, c.name ASC`,
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
      `SELECT DATE_FORMAT(o.occurrence_date, '%Y-%m') AS monthKey, COUNT(*) AS total
       FROM occurrences o
       WHERE ${scope.sql} AND o.occurrence_date >= ?
       GROUP BY monthKey
       ORDER BY monthKey ASC`,
      [...scope.params, firstMonthStart]
    ),
    pool.execute(
      `SELECT o.priority, COUNT(*) AS total
       FROM occurrences o
       WHERE ${scope.sql}
       GROUP BY o.priority`,
      scope.params
    ),
    pool.execute(
      `SELECT AVG(TIMESTAMPDIFF(HOUR, o.created_at, o.updated_at)) AS avgHours
       FROM occurrences o
       WHERE ${scope.sql} AND o.status = 'ENCERRADA'`,
      scope.params
    ),
    pool.query('SELECT COUNT(*) AS total FROM students WHERE active = TRUE'),
    isAdmin
      ? pool.query(`SELECT COUNT(*) AS total FROM users WHERE role = 'PROFESSOR' AND active = TRUE`)
      : Promise.resolve([[{ total: null }]]),
    pool.execute(
      `${occurrenceSelect} WHERE ${scope.sql} ORDER BY o.occurrence_date DESC, o.occurrence_time DESC, o.id DESC LIMIT 6`,
      scope.params
    )
  ]);

  const [totalsRows] = totalsResult;
  const [byCategory] = categoriesResult;
  const [byClass] = classesResult;
  const [monthlyRows] = monthlyResult;
  const [priorityRows] = priorityResult;
  const [resolutionRows] = resolutionResult;
  const [studentsCountRows] = studentsCountResult;
  const [teachersCountRows] = teachersCountResult;
  const [recentRows] = recentResult;

  const recent = await attachStudents(recentRows, pool);
  const row = totalsRows[0] ?? {};

  const allCount = Number(row.allCount ?? 0);
  const closedCount = Number(row.closed ?? 0);
  const urgentOpen = Number(row.urgentOpen ?? 0);

  const monthMap = new Map(monthlyRows.map((m) => [m.monthKey, Number(m.total ?? 0)]));
  const byMonth = lastSixMonths.map((item) => ({
    month: item.month,
    label: item.label,
    total: monthMap.get(item.month) ?? 0
  }));

  const currentMonthCount = byMonth[byMonth.length - 1]?.total ?? 0;
  const previousMonthCount = byMonth[byMonth.length - 2]?.total ?? 0;

  const priorityMap = new Map(priorityRows.map((p) => [p.priority, Number(p.total ?? 0)]));
  const byPriority = ['URGENTE', 'ALTA', 'MEDIA', 'BAIXA'].map((priority) => ({
    priority,
    total: priorityMap.get(priority) ?? 0
  }));

  const rawAvgHours = resolutionRows[0]?.avgHours;
  const avgResolutionHours = rawAvgHours !== null && rawAvgHours !== undefined
    ? Math.max(0, Math.round(Number(rawAvgHours) * 10) / 10)
    : null;

  const resolutionRate = allCount > 0 ? Math.round((closedCount / allCount) * 100) : 0;

  res.json({
    totals: {
      all: allCount,
      pending: Number(row.pending ?? 0),
      analysis: Number(row.analysis ?? 0),
      monitoring: Number(row.monitoring ?? 0),
      closed: closedCount
    },
    byMonth,
    byCategory: byCategory.map((c) => ({ name: c.name, total: Number(c.total ?? 0) })),
    byClass: byClass.map((c) => ({ name: c.name, total: Number(c.total ?? 0) })),
    byPriority,
    performance: {
      resolutionRate,
      avgResolutionHours,
      currentMonthCount,
      previousMonthCount,
      urgentOpen,
      activeStudents: Number(studentsCountRows[0]?.total ?? 0),
      activeTeachers: teachersCountRows[0]?.total !== null && teachersCountRows[0]?.total !== undefined
        ? Number(teachersCountRows[0].total)
        : null
    },
    recent,
    updatedAt: new Date().toISOString()
  });
});
