export function notFound(_req, res) {
  res.status(404).json({ message: 'Rota não encontrada.' });
}

export function errorHandler(error, _req, res, _next) {
  if (error?.type === 'entity.parse.failed' || error instanceof SyntaxError) {
    return res.status(400).json({ message: 'Corpo da requisição JSON inválido.' });
  }
  if (error?.code === 'CORS_NOT_ALLOWED') {
    return res.status(403).json({ message: 'Origem não autorizada pela política de segurança (CORS).' });
  }
  if (error?.errno === 1062) {
    return res.status(409).json({ message: 'Já existe um cadastro com essa matrícula ou e-mail.' });
  }
  if (error?.errno === 1451 || error?.errno === 1452) {
    return res.status(400).json({ message: 'Operação inválida por violação de integridade referencial.' });
  }

  // Diagnóstico claro para erros de conexão com banco de dados em produção / nuvem
  if (error?.code === 'ECONNREFUSED') {
    return res.status(503).json({
      message: 'Não foi possível conectar ao MySQL (ECONNREFUSED). Verifique se DB_HOST e DB_PORT apontam para um banco MySQL na nuvem.'
    });
  }
  if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') {
    return res.status(503).json({
      message: 'Servidor MySQL (DB_HOST) não encontrado. Confira o endereço configurado nas variáveis de ambiente.'
    });
  }
  if (error?.code === 'ER_ACCESS_DENIED_ERROR') {
    return res.status(503).json({
      message: 'Acesso negado pelo MySQL. Confira DB_USER e DB_PASSWORD nas variáveis de ambiente.'
    });
  }
  if (error?.code === 'ER_BAD_DB_ERROR') {
    return res.status(503).json({
      message: 'O banco de dados informado em DB_NAME não existe no servidor MySQL.'
    });
  }
  if (
    error?.code === 'HANDSHAKE_NO_SSL_SUPPORT' ||
    error?.code === 'ER_SECURE_TRANSPORT_REQUIRED' ||
    error?.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    error?.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    error?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
  ) {
    return res.status(503).json({
      message: 'Erro de certificado SSL no MySQL. Configure DB_SSL=true e DB_SSL_REJECT_UNAUTHORIZED=false.'
    });
  }

  const status = Number(error?.status ?? 500);
  if (process.env.NODE_ENV !== 'test') console.error(error);
  const message = status >= 500 ? 'Erro interno do servidor.' : error.message;
  return res.status(status).json({ message });
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
