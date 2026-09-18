export function notFound(req, res) {
  res.status(404).json({ message: 'Rota não encontrada.' });
}

export function errorHandler(error, req, res, _next) {
  if (error?.errno === 1062) {
    return res.status(409).json({ message: 'Já existe um cadastro com essa matrícula ou e-mail.' });
  }
  const status = Number(error.status ?? 500);
  if (process.env.NODE_ENV !== 'test') console.error(error);
  const message = status >= 500 ? 'Erro interno do servidor.' : error.message;
  res.status(status).json({ message });
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
