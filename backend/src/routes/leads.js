const router = require('express').Router();
const db = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const emailParser = require('../services/emailParserService');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { status, zugewiesen_an, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let q = db('leads as l')
      .leftJoin('fahrzeuge as f', 'f.id', 'l.fahrzeug_id')
      .leftJoin('nutzer as n', 'n.id', 'l.zugewiesen_an')
      .leftJoin('kunden as k', 'k.id', 'l.kunden_id')
      .select(
        'l.*',
        'f.intern_nummer', 'f.marke', 'f.modell',
        db.raw("n.vorname || ' ' || n.nachname as zugewiesen_an_name"),
        db.raw("k.vorname || ' ' || k.nachname as kunde_name")
      )
      .orderBy('l.erstellt_am', 'desc');

    if (!req.user.perm_admin && !req.user.sichtbarkeit_alle_standorte) {
      q = q.where('l.standort_id', req.user.standort_id);
    }
    if (!req.user.perm_lead_zuweisen) {
      // Sellers only see their own leads
      q = q.where('l.zugewiesen_an', req.user.id);
    }
    if (status) q = q.where('l.status', status);
    if (zugewiesen_an) q = q.where('l.zugewiesen_an', zugewiesen_an);

    const [count, rows] = await Promise.all([
      q.clone().clearSelect().count('l.id as total').first(),
      q.limit(parseInt(limit)).offset(offset),
    ]);

    res.json({ data: rows, total: parseInt(count.total) });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const lead = await db('leads').where({ id: req.params.id }).first();
    if (!lead) return res.status(404).json({ error: 'Lead nicht gefunden' });
    const aktivitaeten = await db('lead_aktivitaeten as la')
      .leftJoin('nutzer as n', 'n.id', 'la.nutzer_id')
      .select('la.*', db.raw("n.vorname || ' ' || n.nachname as nutzer_name"))
      .where('la.lead_id', req.params.id)
      .orderBy('la.erstellt_am', 'desc');
    res.json({ ...lead, aktivitaeten });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const id = uuidv4();
    await db('leads').insert({
      id,
      standort_id: req.body.standort_id || req.user.standort_id,
      zugewiesen_an: req.body.zugewiesen_an || req.user.id,
      ...req.body,
    });
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const data = { ...req.body, aktualisiert_am: new Date(), letzte_aktivitaet: new Date() };
    delete data.id;
    await db('leads').where({ id: req.params.id }).update(data);
    res.json({ message: 'Lead aktualisiert' });
  } catch (e) { next(e); }
});

// Add activity log entry
router.post('/:id/aktivitaet', async (req, res, next) => {
  try {
    const { typ, beschreibung } = req.body;
    const id = uuidv4();
    await db('lead_aktivitaeten').insert({
      id, lead_id: req.params.id, typ, beschreibung, nutzer_id: req.user.id,
    });
    await db('leads').where({ id: req.params.id }).update({ letzte_aktivitaet: new Date() });
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

// Assign lead
router.post('/:id/zuweisen', requirePermission('perm_lead_zuweisen'), async (req, res, next) => {
  try {
    await db('leads').where({ id: req.params.id }).update({
      zugewiesen_an: req.body.nutzer_id,
      zugewiesen_von: req.user.id,
      aktualisiert_am: new Date(),
    });
    res.json({ message: 'Lead zugewiesen' });
  } catch (e) { next(e); }
});

// Convert lead to customer
router.post('/:id/konvertieren', async (req, res, next) => {
  try {
    const lead = await db('leads').where({ id: req.params.id }).first();
    if (!lead) return res.status(404).json({ error: 'Lead nicht gefunden' });

    const kunden_id = uuidv4();
    const nameParts = (lead.vorname || '').split(' ');
    await db('kunden').insert({
      id: kunden_id,
      vorname: lead.vorname,
      nachname: lead.nachname,
      email: lead.email,
      telefon: lead.telefon,
      herkunft: lead.herkunft,
      standort_id: lead.standort_id,
      zustaendiger_nutzer_id: lead.zugewiesen_an,
    });

    await db('leads').where({ id: req.params.id }).update({
      kunden_id, status: 'gewonnen', aktualisiert_am: new Date(),
    });

    res.json({ message: 'Lead zu Kunde konvertiert', kunden_id });
  } catch (e) { next(e); }
});

// Fetch emails from IMAP (trigger manual import)
router.post('/import/email', requirePermission('perm_lead_zuweisen'), async (req, res, next) => {
  try {
    const leadIds = await emailParser.fetchUnseenEmails();
    res.json({ message: `${leadIds.length} Leads importiert`, lead_ids: leadIds });
  } catch (e) { next(e); }
});

// Parse a pasted raw email
router.post('/import/parse', async (req, res, next) => {
  try {
    const { raw_email } = req.body;
    const { leadInfo, fahrzeug } = await emailParser.parseRawEmail(raw_email);
    res.json({ leadInfo, fahrzeug });
  } catch (e) { next(e); }
});

module.exports = router;
