const db = require('../config/database');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const provisionService = require('../services/provisionService');

// Helper: build standort filter based on user permissions
function standortFilter(query, user) {
  if (user.perm_admin || user.sichtbarkeit_alle_standorte) return query;
  return query.where('f.standort_id', user.standort_id);
}

async function list(req, res, next) {
  try {
    const {
      page = 1, limit = 20, status, standort_id, marke, suche,
      sort = 'erstellt_am', dir = 'desc',
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = db('fahrzeuge as f')
      .leftJoin('standorte as s', 's.id', 'f.standort_id')
      .leftJoin('stellplaetze as sp', 'sp.id', 'f.aktueller_stellplatz_id')
      .leftJoin('nutzer as vv', 'vv.id', 'f.verkauf_nutzer_id')
      .leftJoin('kunden as k', 'k.id', 'f.kunden_id')
      .select(
        'f.id', 'f.intern_nummer', 'f.vin', 'f.kennzeichen',
        'f.marke', 'f.modell', 'f.variante', 'f.baujahr',
        'f.farbe', 'f.kilometer', 'f.kraftstoff', 'f.leistung_ps',
        'f.status', 'f.zielverkaufspreis', 'f.verkaufspreis',
        'f.einkaufsdatum', 'f.verkaufsdatum',
        db.raw("CURRENT_DATE - f.einkaufsdatum AS standzeit_tage"),
        's.name as standort_name',
        'sp.bezeichnung as stellplatz',
        db.raw("vv.vorname || ' ' || vv.nachname as verkaefer"),
        db.raw("k.vorname || ' ' || k.nachname as kaeufer")
      );

    // Einkaufspreis nur für berechtigte Nutzer
    if (req.user.perm_fahrzeug_einkaufspreis_sehen || req.user.perm_admin) {
      query = query.select('f.einkaufspreis');
    }

    // Standort-Filter
    if (!req.user.perm_admin && !req.user.sichtbarkeit_alle_standorte) {
      query = query.where('f.standort_id', req.user.standort_id);
    }

    if (status) query = query.where('f.status', status);
    if (standort_id) query = query.where('f.standort_id', standort_id);
    if (marke) query = query.whereILike('f.marke', `%${marke}%`);
    if (suche) {
      query = query.where(function () {
        this.whereILike('f.marke', `%${suche}%`)
          .orWhereILike('f.modell', `%${suche}%`)
          .orWhereILike('f.vin', `%${suche}%`)
          .orWhereILike('f.kennzeichen', `%${suche}%`)
          .orWhereILike('f.intern_nummer', `%${suche}%`);
      });
    }

    const allowedSort = ['erstellt_am', 'marke', 'status', 'standzeit_tage', 'zielverkaufspreis'];
    const sortCol = allowedSort.includes(sort) ? `f.${sort}` : 'f.erstellt_am';
    query = query.orderBy(sortCol, dir === 'asc' ? 'asc' : 'desc');

    const [countResult, rows] = await Promise.all([
      query.clone().clearSelect().count('f.id as total').first(),
      query.limit(parseInt(limit)).offset(offset),
    ]);

    res.json({
      data: rows,
      total: parseInt(countResult.total),
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(parseInt(countResult.total) / parseInt(limit)),
    });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const { id } = req.params;
    const fahrzeug = await db('fahrzeuge as f')
      .leftJoin('standorte as s', 's.id', 'f.standort_id')
      .leftJoin('stellplaetze as sp', 'sp.id', 'f.aktueller_stellplatz_id')
      .leftJoin('nutzer as ev', 'ev.id', 'f.einkauf_nutzer_id')
      .leftJoin('nutzer as vv', 'vv.id', 'f.verkauf_nutzer_id')
      .leftJoin('kunden as k', 'k.id', 'f.kunden_id')
      .select(
        'f.*',
        's.name as standort_name', 's.adresse as standort_adresse',
        'sp.bezeichnung as stellplatz_bezeichnung', 'sp.bereich as stellplatz_bereich',
        db.raw("ev.vorname || ' ' || ev.nachname as einkauf_von"),
        db.raw("vv.vorname || ' ' || vv.nachname as verkauf_von"),
        db.raw("k.vorname || ' ' || k.nachname as kaeufer_name"),
        'k.email as kaeufer_email', 'k.telefon as kaeufer_telefon'
      )
      .where('f.id', id)
      .first();

    if (!fahrzeug) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });

    // Hide EK price if no permission
    if (!req.user.perm_fahrzeug_einkaufspreis_sehen && !req.user.perm_admin) {
      delete fahrzeug.einkaufspreis;
    }

    // Fotos
    const fotos = await db('fahrzeug_fotos')
      .where({ fahrzeug_id: id })
      .orderBy('position');

    // Dokumente
    const dokumente = await db('fahrzeug_dokumente')
      .where({ fahrzeug_id: id })
      .orderBy('erstellt_am', 'desc');

    // Schaeden
    const schaeden = await db('schaeden')
      .where({ fahrzeug_id: id })
      .orderBy('erstellt_am', 'desc');

    res.json({ ...fahrzeug, fotos, dokumente, schaeden });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = req.body;
    const id = uuidv4();

    // Generate intern number
    const lastNr = await db('fahrzeuge').max('intern_nummer as max').first();
    const nextNr = lastNr?.max
      ? String(parseInt(lastNr.max.replace(/\D/g, '')) + 1).padStart(5, '0')
      : '00001';
    const intern_nummer = `FZ-${nextNr}`;

    const fahrzeug = {
      id,
      intern_nummer,
      standort_id: data.standort_id || req.user.standort_id,
      erstellt_von: req.user.id,
      ...data,
    };

    await db('fahrzeuge').insert(fahrzeug);

    // Initial status history
    await db('fahrzeug_status_history').insert({
      id: uuidv4(),
      fahrzeug_id: id,
      status_neu: fahrzeug.status || 'eingang',
      notiz: 'Fahrzeug angelegt',
      nutzer_id: req.user.id,
    });

    logger.info(`Fahrzeug angelegt: ${intern_nummer}`, { user: req.user.id });
    res.status(201).json({ id, intern_nummer });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const data = { ...req.body, aktualisiert_am: new Date() };
    delete data.id;
    delete data.intern_nummer;

    await db('fahrzeuge').where({ id }).update(data);
    res.json({ message: 'Fahrzeug aktualisiert' });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const fz = await db('fahrzeuge').where({ id }).first();
    if (!fz) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    if (fz.status === 'verkauft') {
      return res.status(400).json({ error: 'Verkaufte Fahrzeuge können nicht gelöscht werden' });
    }
    await db('fahrzeuge').where({ id }).update({ status: 'archiv', aktualisiert_am: new Date() });
    res.json({ message: 'Fahrzeug archiviert' });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, notiz } = req.body;

    const validStatuses = ['eingang', 'inspektion', 'werkstatt', 'aufbereitung', 'bereit', 'aktiv_angebot', 'verkauft', 'exportiert', 'archiv'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Ungültiger Status', valid: validStatuses });
    }

    const fz = await db('fahrzeuge').where({ id }).select('status').first();
    if (!fz) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });

    await db.transaction(async trx => {
      await trx('fahrzeuge').where({ id }).update({ status, aktualisiert_am: new Date() });
      await trx('fahrzeug_status_history').insert({
        id: uuidv4(),
        fahrzeug_id: id,
        status_alt: fz.status,
        status_neu: status,
        notiz,
        nutzer_id: req.user.id,
      });
    });

    res.json({ message: 'Status aktualisiert', status });
  } catch (err) {
    next(err);
  }
}

async function statusHistory(req, res, next) {
  try {
    const { id } = req.params;
    const history = await db('fahrzeug_status_history as fsh')
      .leftJoin('nutzer as n', 'n.id', 'fsh.nutzer_id')
      .select(
        'fsh.*',
        db.raw("n.vorname || ' ' || n.nachname as nutzer_name")
      )
      .where('fsh.fahrzeug_id', id)
      .orderBy('fsh.erstellt_am');

    res.json(history);
  } catch (err) {
    next(err);
  }
}

async function verkaufen(req, res, next) {
  try {
    const { id } = req.params;
    const { verkaufspreis, kunden_id, verkaufsdatum, finanzierung, rsv, versicherung, versicherung_typ } = req.body;

    const fz = await db('fahrzeuge').where({ id }).first();
    if (!fz) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    if (fz.status === 'verkauft') return res.status(400).json({ error: 'Fahrzeug bereits verkauft' });

    const vd = verkaufsdatum ? new Date(verkaufsdatum) : new Date();
    const gesamtkosten = (fz.einkaufspreis || 0) + (fz.aufbereitungskosten || 0) + (fz.reparaturkosten || 0) + (fz.sonstige_kosten || 0);
    const bruttoertrag = parseFloat(verkaufspreis) - gesamtkosten;

    await db.transaction(async trx => {
      // Update fahrzeug
      await trx('fahrzeuge').where({ id }).update({
        status: 'verkauft',
        verkaufspreis: parseFloat(verkaufspreis),
        verkaufsdatum: vd,
        kunden_id,
        verkauf_nutzer_id: req.user.id,
        bruttoertrag,
        aktualisiert_am: new Date(),
      });

      // Status history
      await trx('fahrzeug_status_history').insert({
        id: uuidv4(),
        fahrzeug_id: id,
        status_alt: fz.status,
        status_neu: 'verkauft',
        notiz: `Verkauft für ${verkaufspreis}€`,
        nutzer_id: req.user.id,
      });

      // Stellplatz freigeben
      if (fz.aktueller_stellplatz_id) {
        await trx('stellplaetze').where({ id: fz.aktueller_stellplatz_id }).update({ status: 'frei' });
        await trx('fahrzeuge').where({ id }).update({ aktueller_stellplatz_id: null });
      }

      // Provision berechnen
      const provision = await provisionService.berechnen({
        fahrzeug: { ...fz, verkaufspreis: parseFloat(verkaufspreis), verkaufsdatum: vd, bruttoertrag },
        verkauf_nutzer_id: req.user.id,
        kunden_id,
        finanzierung,
        rsv,
        versicherung,
        versicherung_typ,
      });
      await trx('provisionen').insert({ id: uuidv4(), ...provision });
    });

    res.json({ message: 'Fahrzeug verkauft' });
  } catch (err) {
    next(err);
  }
}

async function stats(req, res, next) {
  try {
    const baseQuery = db('fahrzeuge as f');
    if (!req.user.perm_admin && !req.user.sichtbarkeit_alle_standorte) {
      baseQuery.where('f.standort_id', req.user.standort_id);
    }

    const [statusStats, standortStats] = await Promise.all([
      baseQuery.clone().groupBy('f.status').select('f.status').count('* as anzahl'),
      baseQuery.clone()
        .join('standorte as s', 's.id', 'f.standort_id')
        .groupBy('s.id', 's.name')
        .select('s.name')
        .count('* as anzahl'),
    ]);

    res.json({ nach_status: statusStats, nach_standort: standortStats });
  } catch (err) {
    next(err);
  }
}

async function getQrCode(req, res, next) {
  try {
    const { id } = req.params;
    const fz = await db('fahrzeuge').where({ id }).select('id', 'intern_nummer', 'vin').first();
    if (!fz) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });

    const data = JSON.stringify({ type: 'fahrzeug', id: fz.id, nr: fz.intern_nummer });
    const qr = await QRCode.toDataURL(data, { width: 300, margin: 2 });
    res.json({ qrCode: qr, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove, updateStatus, statusHistory, verkaufen, stats, getQrCode };
