import { Router } from 'express';
import { pool } from '../config/db.js';
import { defaultClassNames } from '../config/classes.js';

export const metadataRouter = Router();

metadataRouter.get('/', async (_req, res) => {
  const [[categories], [locations], [classRows]] = await Promise.all([
    pool.query('SELECT id, name FROM categories WHERE active = TRUE ORDER BY name'),
    pool.query('SELECT id, name FROM locations WHERE active = TRUE ORDER BY name'),
    pool.query('SELECT DISTINCT class_name AS className FROM students WHERE active = TRUE ORDER BY class_name')
  ]);
  const registeredClasses = classRows.map((item) => item.className);
  const additionalClasses = registeredClasses.filter((className) => !defaultClassNames.includes(className));

  res.json({
    categories,
    locations,
    classes: [...defaultClassNames, ...additionalClasses]
  });
});
