import { Router } from 'express';
import { pool } from '../config/db.js';
import { allowRoles } from '../middleware/auth.js';

export const notificationsRouter = Router();

let tableEnsured = false;

async function ensureNotificationReadsTable() {
  if (tableEnsured) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS notification_reads (
      user_id INT UNSIGNED NOT NULL,
      notification_key VARCHAR(80) NOT NULL,
      read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, notification_key),
      CONSTRAINT fk_notification_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
  tableEnsured = true;
}

notificationsRouter.get('/', allowRoles('ADMINISTRADOR', 'PROFESSOR'), async (req, res) => {
  await ensureNotificationReadsTable();
  const userId = req.user.id;

  if (req.user.role === 'ADMINISTRADOR') {
    const [occResult, updResult, pendingResult, readsResult] = await Promise.all([
      pool.execute(
        `SELECT o.id AS occurrenceId,
                o.protocol,
                o.status,
                o.priority,
                o.created_at AS createdAt,
                c.name AS categoryName,
                l.name AS locationName,
                u.name AS authorName,
                u.role AS authorRole,
                (SELECT GROUP_CONCAT(CONCAT(s.name, ' (', s.class_name, ')') SEPARATOR ', ')
                 FROM occurrence_students os
                 INNER JOIN students s ON s.id = os.student_id
                 WHERE os.occurrence_id = o.id) AS studentSummary
         FROM occurrences o
         INNER JOIN categories c ON c.id = o.category_id
         INNER JOIN locations l ON l.id = o.location_id
         INNER JOIN users u ON u.id = o.created_by
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT 20`
      ),
      pool.execute(
        `SELECT up.id AS updateId,
                up.occurrence_id AS occurrenceId,
                up.observation,
                up.action_taken AS actionTaken,
                up.new_status AS newStatus,
                up.created_at AS createdAt,
                o.protocol,
                o.priority,
                c.name AS categoryName,
                u.name AS authorName
         FROM occurrence_updates up
         INNER JOIN occurrences o ON o.id = up.occurrence_id
         INNER JOIN categories c ON c.id = o.category_id
         INNER JOIN users u ON u.id = up.created_by
         WHERE u.role = 'PROFESSOR'
         ORDER BY up.created_at DESC, up.id DESC
         LIMIT 15`
      ),
      pool.execute(`SELECT COUNT(*) AS total FROM occurrences WHERE status = 'PENDENTE'`),
      pool.execute(`SELECT notification_key AS notificationKey FROM notification_reads WHERE user_id = ?`, [userId])
    ]);

    const [occRows] = occResult;
    const [updRows] = updResult;
    const [pendingRows] = pendingResult;
    const [readRows] = readsResult;
    const readSet = new Set(readRows.map((r) => r.notificationKey));

    const items = [
      ...occRows.map((row) => {
        const key = `occ-${row.occurrenceId}`;
        return {
          key,
          type: 'NEW_OCCURRENCE',
          occurrenceId: row.occurrenceId,
          protocol: row.protocol,
          title: `Nova ocorrência: ${row.categoryName}`,
          message: `${row.studentSummary || 'Aluno(s)'} • Registrada por ${row.authorName}`,
          priority: row.priority,
          status: row.status,
          authorName: row.authorName,
          createdAt: row.createdAt,
          read: readSet.has(key)
        };
      }),
      ...updRows.map((row) => {
        const key = `upd-${row.updateId}`;
        return {
          key,
          type: 'PROFESSOR_UPDATE',
          occurrenceId: row.occurrenceId,
          protocol: row.protocol,
          title: `Novo acompanhamento (${row.protocol})`,
          message: `${row.authorName}: ${row.observation || row.actionTaken || 'Observação adicionada'}`,
          priority: row.priority,
          status: row.newStatus,
          authorName: row.authorName,
          createdAt: row.createdAt,
          read: readSet.has(key)
        };
      })
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 25);

    const unreadCount = items.filter((item) => !item.read).length;
    const pendingCount = Number(pendingRows[0]?.total ?? 0);

    return res.json({
      items,
      unreadCount,
      pendingCount
    });
  }

  // PROFESSOR notifications: updates registered by ADMINISTRADOR on occurrences created by this professor
  const [updResult, pendingResult, readsResult] = await Promise.all([
    pool.execute(
      `SELECT up.id AS updateId,
              up.occurrence_id AS occurrenceId,
              up.observation,
              up.action_taken AS actionTaken,
              up.previous_status AS previousStatus,
              up.new_status AS newStatus,
              up.created_at AS createdAt,
              o.protocol,
              o.priority,
              c.name AS categoryName,
              u.name AS authorName
       FROM occurrence_updates up
       INNER JOIN occurrences o ON o.id = up.occurrence_id
       INNER JOIN categories c ON c.id = o.category_id
       INNER JOIN users u ON u.id = up.created_by
       WHERE o.created_by = ? AND u.role = 'ADMINISTRADOR'
       ORDER BY up.created_at DESC, up.id DESC
       LIMIT 20`,
      [userId]
    ),
    pool.execute(`SELECT COUNT(*) AS total FROM occurrences WHERE created_by = ? AND status = 'PENDENTE'`, [userId]),
    pool.execute(`SELECT notification_key AS notificationKey FROM notification_reads WHERE user_id = ?`, [userId])
  ]);

  const [updRows] = updResult;
  const [pendingRows] = pendingResult;
  const [readRows] = readsResult;
  const readSet = new Set(readRows.map((r) => r.notificationKey));

  const items = updRows.map((row) => {
    const key = `upd-${row.updateId}`;
    return {
      key,
      type: 'ADMIN_UPDATE',
      occurrenceId: row.occurrenceId,
      protocol: row.protocol,
      title: `Retorno da Gestão (${row.protocol})`,
      message: `${row.authorName}: ${row.actionTaken || row.observation || 'Status atualizado pela gestão'}`,
      priority: row.priority,
      status: row.newStatus,
      authorName: row.authorName,
      createdAt: row.createdAt,
      read: readSet.has(key)
    };
  });

  const unreadCount = items.filter((item) => !item.read).length;
  const pendingCount = Number(pendingRows[0]?.total ?? 0);

  return res.json({
    items,
    unreadCount,
    pendingCount
  });
});

notificationsRouter.post('/read', allowRoles('ADMINISTRADOR', 'PROFESSOR'), async (req, res) => {
  await ensureNotificationReadsTable();
  const userId = req.user.id;
  const rawKeys = Array.isArray(req.body?.keys)
    ? req.body.keys
    : req.body?.key
      ? [req.body.key]
      : [];

  const keys = [...new Set(
    rawKeys
      .map((k) => String(k ?? '').trim())
      .filter((k) => k.length > 0 && k.length <= 80)
  )];

  if (!keys.length) {
    return res.json({ message: 'Nenhuma notificação informada.' });
  }

  const placeholders = keys.map(() => '(?, ?)').join(', ');
  const params = keys.flatMap((key) => [userId, key]);

  await pool.execute(
    `INSERT IGNORE INTO notification_reads (user_id, notification_key) VALUES ${placeholders}`,
    params
  );

  return res.json({ message: 'Notificações marcadas como lidas.' });
});

