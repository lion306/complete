const router = require('express').Router();
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    let q = db('standorte').where({ aktiv: true }).orderBy('name');
    if (!req.user.perm_admin && !req.user.sichtbarkeit_alle_standorte) {
      q = q.where({ id: req.user.standort_id });
    }
    res.json(await q);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const s = await db('standorte').where({ id: req.params.id }).first();
    if (!s) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(s);
  } catch (e) { next(e); }
});

router.post('/', requireRole('superadmin'), async (req, res, next) => {
  try {
    const id = uuidv4();
    await db('standorte').insert({ id, ...req.body });
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('superadmin', 'standortleiter'), async (req, res, next) => {
  try {
    const data = { ...req.body, aktualisiert_am: new Date() };
    delete data.id;
    await db('standorte').where({ id: req.params.id }).update(data);
    res.json({ message: 'Aktualisiert' });
  } catch (e) { next(e); }
});

module.exports = router;
