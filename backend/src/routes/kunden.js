const router = require('express').Router();
const db = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { suche, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let q = db('kunden as k')
      .leftJoin('nutzer as n', 'n.id', 'k.zustaendiger_nutzer_id')
      .select('k.*', db.raw("n.vorname || ' ' || n.nachname as zustaendiger"))
      .where('k.aktiv', true)
      .orderBy('k.nachname');

    if (!req.user.perm_admin && !req.user.sichtbarkeit_alle_standorte) {
      q = q.where('k.standort_id', req.user.standort_id);
    }
    if (suche) {
      q = q.where(function() {
        this.whereILike('k.nachname', `%${suche}%`)
          .orWhereILike('k.vorname', `%${suche}%`)
          .orWhereILike('k.email', `%${suche}%`)
          .orWhereILike('k.telefon', `%${suche}%`);
      });
    }

    const [count, rows] = await Promise.all([
      q.clone().clearSelect().count('k.id as total').first(),
      q.limit(parseInt(limit)).offset(offset),
    ]);

    res.json({ data: rows, total: parseInt(count.total), page: parseInt(page) });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const kunde = await db('kunden').where({ id: req.params.id }).first();
    if (!kunde) return res.status(404).json({ error: 'Kunde nicht gefunden' });
    const fahrzeuge = await db('fahrzeuge').where({ kunden_id: req.params.id }).select('id', 'intern_nummer', 'marke', 'modell', 'status', 'verkaufsdatum');
    res.json({ ...kunde, fahrzeuge });
  } catch (e) { next(e); }
});

router.post('/', requirePermission('perm_kunde_anlegen'), async (req, res, next) => {
  try {
    const id = uuidv4();
    const data = {
      id,
      standort_id: req.body.standort_id || req.user.standort_id,
      zustaendiger_nutzer_id: req.body.zustaendiger_nutzer_id || req.user.id,
      ...req.body,
    };

    // Check PLZ regional bonus
    if (data.plz) {
      const region = await db('plz_regionen')
        .where({ aktiv: true })
        .whereRaw('? BETWEEN plz_von AND plz_bis', [data.plz])
        .first();
      data.plz_region_bonus = !!region;
    }

    await db('kunden').insert(data);
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

router.put('/:id', requirePermission('perm_kunde_bearbeiten'), async (req, res, next) => {
  try {
    const data = { ...req.body, aktualisiert_am: new Date() };
    delete data.id;
    if (data.plz) {
      const region = await db('plz_regionen')
        .where({ aktiv: true })
        .whereRaw('? BETWEEN plz_von AND plz_bis', [data.plz])
        .first();
      data.plz_region_bonus = !!region;
    }
    await db('kunden').where({ id: req.params.id }).update(data);
    res.json({ message: 'Kunde aktualisiert' });
  } catch (e) { next(e); }
});

module.exports = router;
