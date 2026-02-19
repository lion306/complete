const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error(err.message, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id,
  });

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message, details: err.details });
  }
  if (err.name === 'UnauthorizedError' || err.code === 'UNAUTHORIZED') {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }
  if (err.code === 'FORBIDDEN') {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  if (err.code === '23505') { // PostgreSQL unique violation
    return res.status(409).json({ error: 'Datensatz existiert bereits', detail: err.detail });
  }
  if (err.code === '23503') { // PostgreSQL foreign key violation
    return res.status(400).json({ error: 'Referenzierter Datensatz nicht gefunden' });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Interner Serverfehler' : err.message,
  });
}

module.exports = { errorHandler };
