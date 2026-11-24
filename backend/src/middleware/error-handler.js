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
