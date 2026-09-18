import { app } from './app.js';
import { checkDatabase, pool } from './config/db.js';
import { env } from './config/env.js';

try {
  await checkDatabase();
  const server = app.listen(env.port, () => console.log(`API disponível em http://localhost:${env.port}`));
  const shutdown = () => server.close(async () => { await pool.end(); process.exit(0); });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error('Não foi possível iniciar a API:', error.message);
  process.exit(1);
}
