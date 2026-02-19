const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    let q = db('nutzer as n')
      .leftJoin('standorte as s', 's.id', 'n.standort_id')
      .select('n.id', 'n.email', 'n.vorname', 'n.nachname', 'n.rolle',
        'n.aktiv', 'n.standort_id', 'n.letzter_login',
        's.name as standort_name',
        ...Object.keys(await db('nutzer').columnInfo()).filter(c => c.startsWith('perm_'))
      )
      .where('n.aktiv', true);

    if (!req.user.perm_admin && !req.user.sichtbarkeit_alle_standorte) {
      q = q.where('n.standort_id', req.user.standort_id);
    }
    res.json(await q.orderBy(['n.nachname', 'n.vorname']));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const u = await db('nutzer').where({ id: req.params.id }).first();
    if (!u) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    delete u.passwort_hash;
    delete u.refresh_token_hash;
    res.json(u);
  } catch (e) { next(e); }
});

router.post('/', requirePermission('perm_admin'), async (req, res, next) => {
  try {
    const { email, passwort, ...rest } = req.body;
    const hash = await bcrypt.hash(passwort || 'Autohaus2024!', 12);
    const id = uuidv4();
    await db('nutzer').insert({
      id,
      email: email.toLowerCase(),
      passwort_hash: hash,
      ...rest,
    });
    res.status(201).json({ id, message: 'Nutzer angelegt' });
  } catch (e) { next(e); }
});

router.put('/:id', requirePermission('perm_admin'), async (req, res, next) => {
  try {
    const data = { ...req.body, aktualisiert_am: new Date() };
    delete data.id;
    delete data.passwort_hash;
    delete data.refresh_token_hash;
    delete data.email; // email changes via separate endpoint
    await db('nutzer').where({ id: req.params.id }).update(data);
    res.json({ message: 'Nutzer aktualisiert' });
  } catch (e) { next(e); }
});

router.delete('/:id', requirePermission('perm_admin'), async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Eigenen Account nicht deaktivierbar' });
    }
    await db('nutzer').where({ id: req.params.id }).update({ aktiv: false });
    res.json({ message: 'Nutzer deaktiviert' });
  } catch (e) { next(e); }
});

// Reset password (admin)
router.post('/:id/reset-password', requirePermission('perm_admin'), async (req, res, next) => {
  try {
    const { neues_passwort } = req.body;
    const hash = await bcrypt.hash(neues_passwort || 'Autohaus2024!', 12);
    await db('nutzer').where({ id: req.params.id }).update({ passwort_hash: hash, refresh_token_hash: null });
    res.json({ message: 'Passwort zurückgesetzt' });
  } catch (e) { next(e); }
});

module.exports = router;
