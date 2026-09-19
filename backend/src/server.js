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
  console.error('Não foi possível iniciar a API:', databaseErrorMessage(error));
  process.exit(1);
}

function databaseErrorMessage(error) {
  if (error?.code === 'ER_ACCESS_DENIED_ERROR') {
    return 'usuário ou senha do MySQL incorretos. Confira DB_USER e DB_PASSWORD no arquivo .env.';
  }
  if (error?.code === 'ER_BAD_DB_ERROR') {
    return `o banco "${env.db.database}" não existe. Execute npm run db:setup.`;
  }
  if (error?.code === 'ECONNREFUSED') {
    return 'o MySQL não está ligado ou DB_HOST/DB_PORT estão incorretos.';
  }
  return error?.message ?? 'erro desconhecido.';
}
