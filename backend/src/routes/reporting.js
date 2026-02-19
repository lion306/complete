/**
 * Reporting Routes
 * Standzeiten, Durchlaufzeiten, Kosten-Übersicht, Kanban-Analyse
 */
const router = require('express').Router();
const db     = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ── Standzeit-Übersicht ───────────────────────────────────────────────────────
router.get('/standzeiten', async (req, res, next) => {
  try {
    const { standort_id, von, bis } = req.query;

    let q = db('v_fahrzeug_reporting');

    if (!req.user.perm_admin && !req.user.sichtbarkeit_alle_standorte) {
      q = q.where('standort_name', db('standorte').where({ id: req.user.standort_id }).select('name').first());
    } else if (standort_id) {
      q = q.where('standort_name', db('standorte').where({ id: standort_id }).select('name').first());
    }
    if (von) q = q.where('einkaufsdatum', '>=', von);
    if (bis) q = q.where('einkaufsdatum', '<=', bis);

    const rows = await q.whereNotIn('status', ['archiv']);

    // Ampel-Verteilung
    const ampel = { gruen: 0, gelb: 0, orange: 0, rot: 0 };
    rows.forEach(r => {
      const tage = parseInt(r.standzeit_tage) || 0;
      if      (tage < 30) ampel.gruen++;
      else if (tage < 60) ampel.gelb++;
      else if (tage < 90) ampel.orange++;
      else                ampel.rot++;
    });

    // Durchschnitt
    const avg = rows.length
      ? Math.round(rows.reduce((a, r) => a + parseInt(r.standzeit_tage || 0), 0) / rows.length)
      : 0;

    // Verkaufte: durchschnittliche Verkaufszeit
    const verkauft = await db('fahrzeuge')
      .whereNotNull('verkaufsdatum')
      .whereNotNull('einkaufsdatum')
      .select(db.raw('AVG(verkaufsdatum - einkaufsdatum) AS avg_standtage_verkauft'))
      .first();

    res.json({
      fahrzeuge:          rows,
      ampel_verteilung:   ampel,
      durchschnitt_tage:  avg,
      avg_bis_verkauf:    Math.round(parseFloat(verkauft?.avg_standtage_verkauft) || 0),
      gesamt:             rows.length,
    });
  } catch (err) { next(err); }
});

// ── Standzeit-Ampel (nur kritische) ──────────────────────────────────────────
router.get('/standzeiten/ampel', async (req, res, next) => {
  try {
    const rows = await db('v_standzeit_ampel').orderBy('standzeit_tage', 'desc');
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Kanban-Durchlaufzeit-Analyse ──────────────────────────────────────────────
router.get('/kanban-analyse', async (req, res, next) => {
  try {
    const { standort_id, von, bis } = req.query;

    // Average time per lane
    const laneStats = await db('kanban_bewegungen as kb')
      .join('kanban_lanes as kl', 'kl.id', 'kb.lane_alt_id')
      .select('kl.bezeichnung AS lane', 'kl.farbe')
      .avg('kb.dauer_std AS avg_stunden')
      .count('kb.id AS anzahl')
      .groupBy('kl.id', 'kl.bezeichnung', 'kl.farbe')
      .orderBy('kl.position');

    // Bottlenecks (lanes with highest avg time)
    const bottlenecks = [...laneStats]
      .sort((a, b) => parseFloat(b.avg_stunden) - parseFloat(a.avg_stunden))
      .slice(0, 3);

    // Moves per day (last 30 days)
    const movements = await db('kanban_bewegungen')
      .where('erstellt_am', '>=', db.raw("CURRENT_DATE - INTERVAL '30 days'"))
      .select(db.raw("DATE_TRUNC('day', erstellt_am) AS tag"))
      .count('id AS anzahl')
      .groupByRaw("DATE_TRUNC('day', erstellt_am)")
      .orderBy('tag');

    res.json({ lane_statistik: laneStats, bottlenecks, bewegungen_pro_tag: movements });
  } catch (err) { next(err); }
});

// ── Kosten-Übersicht ──────────────────────────────────────────────────────────
router.get('/kosten', requirePermission('perm_finanzen_sehen'), async (req, res, next) => {
  try {
    const { standort_id, monat } = req.query;

    let q = db('v_fahrzeug_reporting');
    if (standort_id) q = q.where('standort_name', db('standorte').where({ id: standort_id }).select('name').first());
    if (monat)       q = q.whereRaw("DATE_TRUNC('month', einkaufsdatum) = ?", [monat]);

    const rows = await q.select(
      'id', 'intern_nummer', 'marke', 'modell', 'einkaufspreis', 'aufbereitungskosten',
      'reparaturkosten', 'sonstige_kosten', 'gesamtkosten', 'verkaufspreis', 'bruttoertrag',
      'reparatur_kosten_gesamt', 'kundenabzug_gesamt', 'standzeit_tage',
    );

    const totals = rows.reduce((acc, r) => ({
      einkauf:      acc.einkauf      + (parseFloat(r.einkaufspreis) || 0),
      aufbereitung: acc.aufbereitung + (parseFloat(r.aufbereitungskosten) || 0),
      reparatur:    acc.reparatur    + (parseFloat(r.reparaturkosten) || 0),
      sonstiges:    acc.sonstiges    + (parseFloat(r.sonstige_kosten) || 0),
      gesamt:       acc.gesamt       + (parseFloat(r.gesamtkosten) || 0),
      ertrag:       acc.ertrag       + (parseFloat(r.bruttoertrag) || 0),
    }), { einkauf: 0, aufbereitung: 0, reparatur: 0, sonstiges: 0, gesamt: 0, ertrag: 0 });

    res.json({ fahrzeuge: rows, totals });
  } catch (err) { next(err); }
});

// ── Schaden-Entscheidungs-Bericht ────────────────────────────────────────────
router.get('/schaden-entscheidungen', async (req, res, next) => {
  try {
    const { standort_id, fahrzeug_id } = req.query;

    let q = db('schaden_positionen as sp')
      .leftJoin('fahrzeuge as f', 'f.id', 'sp.fahrzeug_id')
      .leftJoin('standorte as s', 's.id', 'f.standort_id')
      .select(
        'sp.entscheidung',
        db.raw('COUNT(sp.id) AS anzahl'),
        db.raw('SUM(sp.kosten_brutto) AS kosten_summe'),
        db.raw('SUM(sp.kundenabzug_betrag) AS abzug_summe'),
      )
      .groupBy('sp.entscheidung');

    if (fahrzeug_id) q = q.where('sp.fahrzeug_id', fahrzeug_id);
    if (standort_id) q = q.where('f.standort_id', standort_id);

    const stats = await q;

    const byEntscheidung = {};
    stats.forEach(r => { byEntscheidung[r.entscheidung] = r; });

    res.json({
      nach_entscheidung:   byEntscheidung,
      gesamt_reparatur:    parseFloat(byEntscheidung.reparieren?.kosten_summe) || 0,
      gesamt_kundenabzug:  parseFloat(byEntscheidung.kundenabzug?.abzug_summe) || 0,
      gesamt_ignoriert:    parseFloat(byEntscheidung.ignorieren?.kosten_summe) || 0,
      ausstehend:          parseInt(byEntscheidung.ausstehend?.anzahl) || 0,
    });
  } catch (err) { next(err); }
});

// ── Foto-Statistiken ──────────────────────────────────────────────────────────
router.get('/fotos', async (req, res, next) => {
  try {
    const stats = await db('fahrzeug_fotos as ff')
      .join('fahrzeuge as f', 'f.id', 'ff.fahrzeug_id')
      .select('ff.kategorie')
      .count('ff.id as anzahl')
      .sum('ff.groesse_bytes as gesamt_bytes')
      .groupBy('ff.kategorie')
      .orderBy('anzahl', 'desc');

    const gesamtBytes = stats.reduce((a, s) => a + parseInt(s.gesamt_bytes || 0), 0);
    const gesamtFotos = stats.reduce((a, s) => a + parseInt(s.anzahl || 0), 0);

    res.json({
      nach_kategorie: stats,
      gesamt_fotos:   gesamtFotos,
      gesamt_mb:      Math.round(gesamtBytes / 1024 / 1024 * 10) / 10,
    });
  } catch (err) { next(err); }
});

module.exports = router;
