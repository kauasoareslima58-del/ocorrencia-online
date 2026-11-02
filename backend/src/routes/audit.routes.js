import { Router } from 'express';
import { pool } from '../config/db.js';
import { allowRoles } from '../middleware/auth.js';

export const auditRouter = Router();
auditRouter.use(allowRoles('ADMINISTRADOR'));

auditRouter.get('/', async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const action = String(req.query.action ?? '').trim();
  const entity = String(req.query.entity ?? '').trim();
  const startDate = String(req.query.startDate ?? '').trim();
  const endDate = String(req.query.endDate ?? '').trim();

  const where = [];
  const params = [];

  if (search) {
    const like = `%${search}%`;
    where.push('(u.name LIKE ? OR CAST(a.details AS CHAR) LIKE ?)');
    params.push(like, like);
  }
  if (action) {
    where.push('a.action = ?');
    params.push(action);
  }
  if (entity) {
    where.push('a.entity = ?');
    params.push(entity);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    where.push('DATE(a.created_at) >= ?');
    params.push(startDate);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    where.push('DATE(a.created_at) <= ?');
    params.push(endDate);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT a.id, a.action, a.entity, a.entity_id AS entityId,
            CAST(a.details AS CHAR) AS details, a.created_at AS createdAt,
            u.name AS userName, u.role AS userRole
     FROM audit_logs a INNER JOIN users u ON u.id = a.user_id
     ${whereClause}
     ORDER BY a.created_at DESC, a.id DESC LIMIT 500`,
    params
  );
  res.json(rows);
});
