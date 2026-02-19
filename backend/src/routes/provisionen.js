const router = require('express').Router();
const db = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const provisionService = require('../services/provisionService');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { monat, nutzer_id, standort_id, status, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let q = db('provisionen as p')
      .join('nutzer as n', 'n.id', 'p.verkauf_nutzer_id')
      .leftJoin('fahrzeuge as f', 'f.id', 'p.fahrzeug_id')
      .leftJoin('kunden as k', 'k.id', 'p.kunden_id')
      .leftJoin('standorte as s', 's.id', 'p.standort_id')
      .select(
        'p.*',
        db.raw("n.vorname || ' ' || n.nachname as verkaefer"),
        'f.intern_nummer', 'f.marke', 'f.modell',
        db.raw("k.vorname || ' ' || k.nachname as kunde_name"),
        's.name as standort_name'
      )
      .orderBy('p.berechnet_am', 'desc');

    // Permission check
    if (!req.user.perm_provision_alle_sehen && !req.user.perm_admin) {
      if (!req.user.perm_provision_sehen) {
        return res.status(403).json({ error: 'Keine Berechtigung für Provision-Ansicht' });
      }
      q = q.where('p.verkauf_nutzer_id', req.user.id);
    }

    if (monat) {
      q = q.whereRaw("DATE_TRUNC('month', p.verkaufsdatum) = ?", [monat]);
    }
    if (nutzer_id) q = q.where('p.verkauf_nutzer_id', nutzer_id);
    if (standort_id) q = q.where('p.standort_id', standort_id);
    if (status) q = q.where('p.status', status);

    const [count, rows] = await Promise.all([
      q.clone().clearSelect().count('p.id as total').first(),
      q.limit(parseInt(limit)).offset(offset),
    ]);

    res.json({ data: rows, total: parseInt(count.total) });
  } catch (e) { next(e); }
});

// Dashboard: cumulated per seller / location
router.get('/dashboard', async (req, res, next) => {
  try {
    const { monat, standort_id } = req.query;

    let q = db('v_provision_zusammenfassung');
    if (!req.user.perm_provision_alle_sehen && !req.user.perm_admin) {
      q = q.where({ nutzer_id: req.user.id });
    }
    if (monat) q = q.whereRaw("monat = ?", [monat]);
    if (standort_id) q = q.where({ standort: standort_id });

    const rows = await q;
    const gesamt = rows.reduce((acc, r) => acc + parseFloat(r.gesamt_provision || 0), 0);

    res.json({ rows, gesamt_provision: Math.round(gesamt * 100) / 100 });
  } catch (e) { next(e); }
});

// Preview calculation
router.post('/berechnen', async (req, res, next) => {
  try {
    const result = provisionService.berechneDirekt(req.body);
    res.json(result);
  } catch (e) { next(e); }
});

// Approve
router.post('/:id/genehmigen', requirePermission('perm_finanzen_sehen'), async (req, res, next) => {
  try {
    await db('provisionen').where({ id: req.params.id }).update({
      status: 'genehmigt',
      genehmigt_von: req.user.id,
      genehmigt_am: new Date(),
      aktualisiert_am: new Date(),
    });
    res.json({ message: 'Provision genehmigt' });
  } catch (e) { next(e); }
});

// Mark paid
router.post('/:id/ausbezahlt', requirePermission('perm_finanzen_sehen'), async (req, res, next) => {
  try {
    await db('provisionen').where({ id: req.params.id }).update({
      status: 'ausbezahlt',
      ausbezahlt_am: new Date(),
      aktualisiert_am: new Date(),
    });
    res.json({ message: 'Als ausbezahlt markiert' });
  } catch (e) { next(e); }
});

// PLZ Regionen management
router.get('/plz-regionen', async (req, res, next) => {
  try {
    const rows = await db('plz_regionen').where({ aktiv: true }).orderBy('region_name');
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/plz-regionen', requirePermission('perm_admin'), async (req, res, next) => {
  try {
    const id = uuidv4();
    await db('plz_regionen').insert({ id, ...req.body });
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

module.exports = router;
