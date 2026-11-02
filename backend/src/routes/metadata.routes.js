import { Router } from 'express';
import { pool } from '../config/db.js';
import { defaultClassNames } from '../config/classes.js';
import { allowRoles } from '../middleware/auth.js';
import { httpError } from '../middleware/error-handler.js';
import { writeAudit } from '../utils/audit.js';

export const metadataRouter = Router();

metadataRouter.get('/', async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true' && req.user?.role === 'ADMINISTRADOR';
  const [[categories], [locations], [classRows], [allCategories], [allLocations]] = await Promise.all([
    pool.query('SELECT id, name, active FROM categories WHERE active = TRUE ORDER BY name'),
    pool.query('SELECT id, name, active FROM locations WHERE active = TRUE ORDER BY name'),
    pool.query('SELECT DISTINCT class_name AS className FROM students WHERE active = TRUE ORDER BY class_name'),
    includeInactive
      ? pool.query('SELECT id, name, active FROM categories ORDER BY active DESC, name')
      : Promise.resolve([[]]),
    includeInactive
      ? pool.query('SELECT id, name, active FROM locations ORDER BY active DESC, name')
      : Promise.resolve([[]])
  ]);
  const registeredClasses = classRows.map((item) => item.className);
  const additionalClasses = registeredClasses.filter((className) => !defaultClassNames.includes(className));

  res.json({
    categories,
    locations,
    classes: [...defaultClassNames, ...additionalClasses],
    ...(includeInactive ? { allCategories, allLocations } : {})
  });
});

metadataRouter.post('/categories', allowRoles('ADMINISTRADOR'), async (req, res) => {
  const name = cleanName(req.body?.name);
  await pool.execute(
    `INSERT INTO categories (name, active) VALUES (?, TRUE)
     ON DUPLICATE KEY UPDATE active = TRUE, name = VALUES(name)`,
    [name]
  );
  const [[category]] = await pool.execute('SELECT id, name, active FROM categories WHERE name = ?', [name]);
  await writeAudit(pool, {
    userId: req.user.id,
    action: 'CREATE',
    entity: 'CATEGORY',
    entityId: category.id,
    details: { name: category.name }
  });
  res.status(201).json(category);
});

metadataRouter.patch('/categories/:id', allowRoles('ADMINISTRADOR'), async (req, res) => {
  const id = Number(req.params.id);
  const active = req.body?.active;
  if (!Number.isInteger(id) || typeof active !== 'boolean') throw httpError(400, 'Dados inválidos.');

  const [[category]] = await pool.execute('SELECT id, name FROM categories WHERE id = ?', [id]);
  if (!category) throw httpError(404, 'Categoria não encontrada.');

  await pool.execute('UPDATE categories SET active = ? WHERE id = ?', [active, id]);
  await writeAudit(pool, {
    userId: req.user.id,
    action: 'UPDATE',
    entity: 'CATEGORY',
    entityId: id,
    details: { name: category.name, active }
  });
  res.json({ id, name: category.name, active });
});

metadataRouter.post('/locations', allowRoles('ADMINISTRADOR'), async (req, res) => {
  const name = cleanName(req.body?.name);
  await pool.execute(
    `INSERT INTO locations (name, active) VALUES (?, TRUE)
     ON DUPLICATE KEY UPDATE active = TRUE, name = VALUES(name)`,
    [name]
  );
  const [[location]] = await pool.execute('SELECT id, name, active FROM locations WHERE name = ?', [name]);
  await writeAudit(pool, {
    userId: req.user.id,
    action: 'CREATE',
    entity: 'LOCATION',
    entityId: location.id,
    details: { name: location.name }
  });
  res.status(201).json(location);
});

metadataRouter.patch('/locations/:id', allowRoles('ADMINISTRADOR'), async (req, res) => {
  const id = Number(req.params.id);
  const active = req.body?.active;
  if (!Number.isInteger(id) || typeof active !== 'boolean') throw httpError(400, 'Dados inválidos.');

  const [[location]] = await pool.execute('SELECT id, name FROM locations WHERE id = ?', [id]);
  if (!location) throw httpError(404, 'Local não encontrado.');

  await pool.execute('UPDATE locations SET active = ? WHERE id = ?', [active, id]);
  await writeAudit(pool, {
    userId: req.user.id,
    action: 'UPDATE',
    entity: 'LOCATION',
    entityId: id,
    details: { name: location.name, active }
  });
  res.json({ id, name: location.name, active });
});

function cleanName(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (text.length < 2 || text.length > 80) {
    throw httpError(400, 'O nome deve ter entre 2 e 80 caracteres.');
  }
  return text;
}
