const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (req.path !== '/health') {
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`, {
        user: req.user?.id,
        ip: req.ip,
      });
    }
  });
  next();
}

module.exports = { requestLogger };
