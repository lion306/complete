const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const logger = require('../utils/logger');

function generateTokens(user) {
  const payload = { id: user.id, email: user.email, rolle: user.rolle };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
  const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  return { accessToken, refreshToken };
}

async function login(req, res, next) {
  try {
    const { email, passwort } = req.body;
    if (!email || !passwort) {
      return res.status(400).json({ error: 'Email und Passwort erforderlich' });
    }

    const user = await db('nutzer').where({ email: email.toLowerCase(), aktiv: true }).first();
    if (!user) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    const valid = await bcrypt.compare(passwort, user.passwort_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    const refreshHash = await bcrypt.hash(refreshToken, 10);

    await db('nutzer').where({ id: user.id }).update({
      letzter_login: new Date(),
      refresh_token_hash: refreshHash,
    });

    delete user.passwort_hash;
    delete user.refresh_token_hash;

    logger.info(`User logged in: ${user.email}`);
    res.json({ accessToken, refreshToken, user });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh-Token erforderlich' });

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Ungültiger Refresh-Token' });
    }

    const user = await db('nutzer').where({ id: payload.id, aktiv: true }).first();
    if (!user || !user.refresh_token_hash) {
      return res.status(401).json({ error: 'Session ungültig' });
    }

    const valid = await bcrypt.compare(refreshToken, user.refresh_token_hash);
    if (!valid) return res.status(401).json({ error: 'Ungültiger Refresh-Token' });

    const tokens = generateTokens(user);
    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await db('nutzer').where({ id: user.id }).update({ refresh_token_hash: refreshHash });

    res.json(tokens);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await db('nutzer').where({ id: req.user.id }).update({ refresh_token_hash: null });
    res.json({ message: 'Erfolgreich abgemeldet' });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json(req.user);
}

async function changePassword(req, res, next) {
  try {
    const { altes_passwort, neues_passwort } = req.body;
    if (!altes_passwort || !neues_passwort) {
      return res.status(400).json({ error: 'Altes und neues Passwort erforderlich' });
    }
    if (neues_passwort.length < 8) {
      return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
    }

    const user = await db('nutzer').where({ id: req.user.id }).first();
    const valid = await bcrypt.compare(altes_passwort, user.passwort_hash);
    if (!valid) return res.status(400).json({ error: 'Altes Passwort falsch' });

    const hash = await bcrypt.hash(neues_passwort, 12);
    await db('nutzer').where({ id: req.user.id }).update({ passwort_hash: hash });
    res.json({ message: 'Passwort erfolgreich geändert' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, refresh, logout, me, changePassword };
