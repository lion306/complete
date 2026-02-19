const jwt = require('jsonwebtoken');
const db = require('../config/database');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentifizierung erforderlich' });
    }
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await db('nutzer')
      .where({ id: payload.id, aktiv: true })
      .first();
    if (!user) {
      return res.status(401).json({ error: 'Nutzer nicht gefunden oder deaktiviert' });
    }
    delete user.passwort_hash;
    delete user.refresh_token_hash;
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token abgelaufen', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Ungültiger Token' });
  }
}

function requirePermission(flag) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Nicht authentifiziert' });
    if (req.user.perm_admin || req.user[flag]) return next();
    return res.status(403).json({ error: `Keine Berechtigung: ${flag}` });
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Nicht authentifiziert' });
    if (req.user.perm_admin || roles.includes(req.user.rolle)) return next();
    return res.status(403).json({ error: 'Rolle nicht autorisiert' });
  };
}

module.exports = { authenticate, requirePermission, requireRole };
