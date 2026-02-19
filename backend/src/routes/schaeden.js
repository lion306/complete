const router = require('express').Router();
const db = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

router.get('/fahrzeug/:fahrzeug_id', async (req, res, next) => {
  try {
    const rows = await db('schaeden as s')
      .leftJoin('nutzer as n', 'n.id', 's.erfasst_von')
      .select('s.*', db.raw("n.vorname || ' ' || n.nachname as erfasst_von_name"))
      .where('s.fahrzeug_id', req.params.fahrzeug_id)
      .orderBy('s.erstellt_am', 'desc');
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', requirePermission('perm_schaden_bearbeiten'), async (req, res, next) => {
  try {
    const id = uuidv4();
    await db('schaeden').insert({ id, erfasst_von: req.user.id, ...req.body });
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

router.put('/:id', requirePermission('perm_schaden_bearbeiten'), async (req, res, next) => {
  try {
    const data = { ...req.body, aktualisiert_am: new Date() };
    delete data.id;
    if (data.status === 'erledigt') {
      data.erledigt_am = new Date();
      data.erledigt_von = req.user.id;
    }
    await db('schaeden').where({ id: req.params.id }).update(data);
    res.json({ message: 'Schaden aktualisiert' });
  } catch (e) { next(e); }
});

router.delete('/:id', requirePermission('perm_schaden_bearbeiten'), async (req, res, next) => {
  try {
    await db('schaeden').where({ id: req.params.id }).delete();
    res.json({ message: 'Schaden gelöscht' });
  } catch (e) { next(e); }
});

// Toggle reparieren/belassen
router.post('/:id/toggle-reparieren', requirePermission('perm_schaden_bearbeiten'), async (req, res, next) => {
  try {
    const schaden = await db('schaeden').where({ id: req.params.id }).first();
    if (!schaden) return res.status(404).json({ error: 'Nicht gefunden' });
    await db('schaeden').where({ id: req.params.id }).update({
      reparieren: !schaden.reparieren,
      aktualisiert_am: new Date(),
    });
    res.json({ reparieren: !schaden.reparieren });
  } catch (e) { next(e); }
});

module.exports = router;
