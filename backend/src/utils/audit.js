export async function writeAudit(runner, { userId, action, entity, entityId = null, details = null }) {
  await runner.execute(
    'INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entity, entityId, details ? JSON.stringify(details) : null]
  );
}

