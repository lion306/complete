/**
 * Kanban Routes
 * GET  /api/kanban/board/:standort_id  – full board (all lanes + cards)
 * PUT  /api/kanban/move                – move card to a new lane
 * GET  /api/kanban/lanes               – list all lanes
 * POST /api/kanban/lanes               – create lane
 * PUT  /api/kanban/lanes/:id           – update lane
 */
const router  = require('express').Router();
const db      = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ── Full Kanban Board ─────────────────────────────────────────────────────────
router.get('/board/:standort_id', async (req, res, next) => {
  try {
    const { standort_id } = req.params;

    // Enforce standort visibility
    if (!req.user.perm_admin && !req.user.sichtbarkeit_alle_standorte) {
      if (req.user.standort_id !== standort_id) {
        return res.status(403).json({ error: 'Kein Zugriff auf diesen Standort' });
      }
    }

    // Lanes (global + standort-specific, ordered)
    const lanes = await db('kanban_lanes')
      .where(function () {
        this.whereNull('standort_id').orWhere('standort_id', standort_id);
      })
      .where({ aktiv: true })
      .orderBy('position');

    // Cards for each lane
    const cards = await db('v_fahrzeug_reporting as r')
      .where('r.standort_name', db('standorte').where({ id: standort_id }).select('name').first())
      .whereNotIn('r.status', ['archiv'])
      .select(
        'r.id', 'r.intern_nummer', 'r.vin', 'r.marke', 'r.modell', 'r.variante',
        'r.baujahr', 'r.kilometer', 'r.status', 'r.kanban_lane_id',
        'r.kanban_lane', 'r.prioritaet', 'r.faellig_am',
        'r.standzeit_tage', 'r.ampel',
        'r.schaden_anzahl', 'r.schaden_ausstehend',
        'r.foto_anzahl', 'r.titelbild',
        'r.gutachten_anzahl', 'r.kanban_position',
        db.raw('r.einkaufspreis IS NOT NULL AS hat_einkaufspreis'),
        'r.zielverkaufspreis',
      )
      .orderBy(['r.kanban_position', 'r.erstellt_am']);

    // Also include cards that have no lane yet (inbox)
    const unassigned = await db('fahrzeuge as f')
      .leftJoin('standorte as s', 's.id', 'f.standort_id')
      .whereNull('f.kanban_lane_id')
      .where('f.standort_id', standort_id)
      .whereNotIn('f.status', ['verkauft', 'archiv'])
      .select(
        'f.id', 'f.intern_nummer', 'f.marke', 'f.modell', 'f.status',
        'f.prioritaet', 'f.faellig_am', 'f.kanban_position',
        db.raw('CURRENT_DATE - f.einkaufsdatum AS standzeit_tage'),
        db.raw("CASE WHEN CURRENT_DATE - f.einkaufsdatum < 30 THEN 'gruen' WHEN CURRENT_DATE - f.einkaufsdatum < 60 THEN 'gelb' WHEN CURRENT_DATE - f.einkaufsdatum < 90 THEN 'orange' ELSE 'rot' END AS ampel"),
      );

    // Build board structure
    const board = lanes.map(lane => ({
      ...lane,
      karten: [
        ...cards.filter(c => c.kanban_lane_id === lane.id),
        ...(lane.position === 0 ? unassigned : []),
      ].sort((a, b) => (a.kanban_position || 0) - (b.kanban_position || 0)),
    }));

    const stats = {
      gesamt:       cards.length + unassigned.length,
      ohne_lane:    unassigned.length,
      kritisch:     [...cards, ...unassigned].filter(c => c.ampel === 'rot').length,
      dringend:     [...cards, ...unassigned].filter(c => c.prioritaet === 'dringend').length,
    };

    res.json({ board, stats, lanes });
  } catch (err) {
    next(err);
  }
});

// ── Move Card ────────────────────────────────────────────────────────────────
router.put('/move', requirePermission('perm_fahrzeug_bearbeiten'), async (req, res, next) => {
  try {
    const { fahrzeug_id, lane_id, position, notiz } = req.body;
    if (!fahrzeug_id || !lane_id) {
      return res.status(400).json({ error: 'fahrzeug_id und lane_id erforderlich' });
    }

    const [fz, lane] = await Promise.all([
      db('fahrzeuge').where({ id: fahrzeug_id }).first(),
      db('kanban_lanes').where({ id: lane_id }).first(),
    ]);
    if (!fz)   return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    if (!lane) return res.status(404).json({ error: 'Lane nicht gefunden' });

    const altLane = fz.kanban_lane_id
      ? await db('kanban_lanes').where({ id: fz.kanban_lane_id }).first()
      : null;

    // Calculate time in previous lane
    let dauerStd = null;
    if (fz.checkin_zeitpunkt && altLane) {
      dauerStd = (Date.now() - new Date(fz.aktualisiert_am).getTime()) / 3600000;
    }

    await db.transaction(async trx => {
      await trx('fahrzeuge').where({ id: fahrzeug_id }).update({
        kanban_lane_id:  lane_id,
        kanban_position: position ?? 0,
        aktualisiert_am: new Date(),
        // Sync status field with Kanban lane
        status: laneToStatus(lane.bezeichnung),
      });

      await trx('kanban_bewegungen').insert({
        id:            uuidv4(),
        fahrzeug_id,
        lane_alt_id:   fz.kanban_lane_id,
        lane_neu_id:   lane_id,
        lane_alt_name: altLane?.bezeichnung,
        lane_neu_name: lane.bezeichnung,
        dauer_std:     dauerStd ? Math.round(dauerStd * 100) / 100 : null,
        nutzer_id:     req.user.id,
        notiz,
      });

      // If moved to "Verkauft" lane mark status
      if (lane.ist_endstatus) {
        await trx('fahrzeuge').where({ id: fahrzeug_id }).update({ status: 'verkauft' });
      }
    });

    res.json({ message: 'Karte verschoben', lane: lane.bezeichnung });
  } catch (err) {
    next(err);
  }
});

function laneToStatus(laneBezeichnung) {
  const map = {
    'Eingang / Ankauf': 'eingang',
    'Inspektion':       'inspektion',
    'Werkstatt':        'werkstatt',
    'Lackierung':       'werkstatt',
    'Aufbereitung':     'aufbereitung',
    'Fotoshooting':     'aufbereitung',
    'Bereit / Angebot': 'aktiv_angebot',
    'Verkauft':         'verkauft',
  };
  return map[laneBezeichnung] || 'eingang';
}

// ── Lanes CRUD ───────────────────────────────────────────────────────────────
router.get('/lanes', async (req, res, next) => {
  try {
    const { standort_id } = req.query;
    let q = db('kanban_lanes').where({ aktiv: true }).orderBy('position');
    if (standort_id) {
      q = q.where(function () {
        this.whereNull('standort_id').orWhere('standort_id', standort_id);
      });
    }
    res.json(await q);
  } catch (err) {
    next(err);
  }
});

router.post('/lanes', requirePermission('perm_admin'), async (req, res, next) => {
  try {
    const id = uuidv4();
    await db('kanban_lanes').insert({ id, ...req.body });
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

router.put('/lanes/:id', requirePermission('perm_admin'), async (req, res, next) => {
  try {
    await db('kanban_lanes').where({ id: req.params.id }).update(req.body);
    res.json({ message: 'Lane aktualisiert' });
  } catch (err) {
    next(err);
  }
});

// ── Update card priority / due date ─────────────────────────────────────────
router.patch('/cards/:fahrzeug_id', requirePermission('perm_fahrzeug_bearbeiten'), async (req, res, next) => {
  try {
    const { prioritaet, faellig_am, notiz } = req.body;
    const update = { aktualisiert_am: new Date() };
    if (prioritaet) update.prioritaet = prioritaet;
    if (faellig_am) update.faellig_am = faellig_am;
    await db('fahrzeuge').where({ id: req.params.fahrzeug_id }).update(update);
    res.json({ message: 'Karte aktualisiert' });
  } catch (err) {
    next(err);
  }
});

// ── Bewegungshistorie ────────────────────────────────────────────────────────
router.get('/bewegungen/:fahrzeug_id', async (req, res, next) => {
  try {
    const rows = await db('kanban_bewegungen as kb')
      .leftJoin('nutzer as n', 'n.id', 'kb.nutzer_id')
      .select('kb.*', db.raw("n.vorname || ' ' || n.nachname AS nutzer_name"))
      .where('kb.fahrzeug_id', req.params.fahrzeug_id)
      .orderBy('kb.erstellt_am', 'desc');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
