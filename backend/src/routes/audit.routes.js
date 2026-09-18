import { Router } from 'express';
import { pool } from '../config/db.js';
import { allowRoles } from '../middleware/auth.js';

export const auditRouter = Router();
auditRouter.use(allowRoles('ADMINISTRADOR'));

auditRouter.get('/', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT a.id, a.action, a.entity, a.entity_id AS entityId,
            CAST(a.details AS CHAR) AS details, a.created_at AS createdAt,
            u.name AS userName, u.role AS userRole
     FROM audit_logs a INNER JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC, a.id DESC LIMIT 500`
  );
  res.json(rows);
});

