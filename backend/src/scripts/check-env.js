try {
  const { env } = await import('../config/env.js');
  console.log('Configuração carregada com sucesso:');
  console.log(`- Ambiente: ${env.nodeEnv}`);
  console.log(`- API: http://localhost:${env.port}`);
  console.log(`- Origens permitidas (CORS): ${env.allowedOrigins.join(', ')}`);
  console.log(`- MySQL: ${env.db.user}@${env.db.host}:${env.db.port}`);
  console.log(`- Banco: ${env.db.database}`);
  console.log(`- SSL no MySQL: ${env.dbSslEnabled ? 'ativado' : 'desativado'}`);
  console.log(`- Senha do MySQL informada: ${env.db.password ? 'sim' : 'não'}`);
  console.log(`- JWT_SECRET: configurada (${env.jwtSecret.length} caracteres)`);

  if (env.jwtSecret.startsWith('troque-por-') || env.jwtSecret.startsWith('monsenhor-bicudo-chave-secreta')) {
    console.warn('Aviso: troque a JWT_SECRET de exemplo antes de publicar o sistema em produção.');
  }
} catch (error) {
  console.error(`Configuração inválida: ${error.message}`);
  console.error('Confira o arquivo backend/.env e tente novamente.');
  process.exit(1);
}
