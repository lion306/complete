/**
 * Stellplatz Controller - Logistics & Parking Spot Management
 * Handles QR-Code scan, raster visualization, vehicle positioning
 */
const db = require('../config/database');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

async function list(req, res, next) {
  try {
    const { standort_id, status, bereich } = req.query;
    const targetStandort = standort_id || req.user.standort_id;

    let query = db('stellplaetze as sp')
      .leftJoin('fahrzeuge as f', 'f.aktueller_stellplatz_id', 'sp.id')
      .select(
        'sp.*',
        'f.id as fahrzeug_id', 'f.intern_nummer', 'f.marke', 'f.modell',
        'f.kennzeichen', 'f.status as fahrzeug_status'
      )
      .where('sp.standort_id', targetStandort)
      .where('sp.aktiv', true);

    if (status) query = query.where('sp.status', status);
    if (bereich) query = query.where('sp.bereich', bereich);

    const rows = await query.orderBy(['sp.bereich', 'sp.zeile', 'sp.spalte']);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function raster(req, res, next) {
  try {
    const { standort_id } = req.params;
    const standort = await db('standorte').where({ id: standort_id }).first();
    if (!standort) return res.status(404).json({ error: 'Standort nicht gefunden' });

    const spots = await db('stellplaetze as sp')
      .leftJoin('fahrzeuge as f', 'f.aktueller_stellplatz_id', 'sp.id')
      .select(
        'sp.id', 'sp.bezeichnung', 'sp.zeile', 'sp.spalte', 'sp.bereich',
        'sp.typ', 'sp.status', 'sp.qr_code_token',
        'f.id as fahrzeug_id', 'f.intern_nummer', 'f.marke', 'f.modell',
        'f.kennzeichen', 'f.status as fahrzeug_status',
        'f.einkaufsdatum',
        db.raw('CURRENT_DATE - f.einkaufsdatum AS standzeit_tage')
      )
      .where('sp.standort_id', standort_id)
      .where('sp.aktiv', true)
      .orderBy(['sp.zeile', 'sp.spalte']);

    // Build grid matrix
    const raster = [];
    for (let z = 0; z < standort.raster_zeilen; z++) {
      raster[z] = [];
      for (let s = 0; s < standort.raster_spalten; s++) {
        raster[z][s] = spots.find(sp => sp.zeile === z && sp.spalte === s) || null;
      }
    }

    res.json({
      standort: {
        id: standort.id,
        name: standort.name,
        zeilen: standort.raster_zeilen,
        spalten: standort.raster_spalten,
      },
      raster,
      spots,
      stats: {
        gesamt: spots.length,
        frei: spots.filter(s => s.status === 'frei').length,
        belegt: spots.filter(s => s.status === 'belegt').length,
        reserviert: spots.filter(s => s.status === 'reserviert').length,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const spot = await db('stellplaetze').where({ id: req.params.id }).first();
    if (!spot) return res.status(404).json({ error: 'Stellplatz nicht gefunden' });
    res.json(spot);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { standort_id, bezeichnung, zeile, spalte, bereich, typ } = req.body;
    const qr_code_token = uuidv4();
    const id = uuidv4();

    await db('stellplaetze').insert({
      id, standort_id, bezeichnung, zeile, spalte,
      bereich, typ: typ || 'standard', qr_code_token,
    });

    const qrData = JSON.stringify({ type: 'stellplatz', id, token: qr_code_token, bezeichnung });
    const qrCode = await QRCode.toDataURL(qrData, { width: 300 });

    res.status(201).json({ id, bezeichnung, qr_code_token, qrCode });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const data = { ...req.body };
    delete data.id;
    delete data.standort_id;
    delete data.qr_code_token;
    await db('stellplaetze').where({ id }).update(data);
    res.json({ message: 'Stellplatz aktualisiert' });
  } catch (err) {
    next(err);
  }
}

/**
 * QR Scan Handler
 * Receives two QR codes: fahrzeug_token and stellplatz_token
 * Updates vehicle position in DB, logs to history
 */
async function scan(req, res, next) {
  try {
    const { fahrzeug_id, stellplatz_token } = req.body;

    if (!fahrzeug_id || !stellplatz_token) {
      return res.status(400).json({ error: 'fahrzeug_id und stellplatz_token erforderlich' });
    }

    const [fahrzeug, stellplatz] = await Promise.all([
      db('fahrzeuge').where({ id: fahrzeug_id }).first(),
      db('stellplaetze').where({ qr_code_token: stellplatz_token }).first(),
    ]);

    if (!fahrzeug) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    if (!stellplatz) return res.status(404).json({ error: 'Stellplatz nicht gefunden (ungültiger QR-Code)' });
    if (stellplatz.status === 'gesperrt') {
      return res.status(400).json({ error: 'Stellplatz ist gesperrt' });
    }

    await db.transaction(async trx => {
      // Free old spot if any
      if (fahrzeug.aktueller_stellplatz_id && fahrzeug.aktueller_stellplatz_id !== stellplatz.id) {
        await trx('stellplaetze')
          .where({ id: fahrzeug.aktueller_stellplatz_id })
          .update({ status: 'frei' });
      }

      // Free current occupant of target spot if any
      if (stellplatz.status === 'belegt') {
        await trx('fahrzeuge')
          .where({ aktueller_stellplatz_id: stellplatz.id })
          .update({ aktueller_stellplatz_id: null });
      }

      // Update vehicle position
      await trx('fahrzeuge').where({ id: fahrzeug_id }).update({
        aktueller_stellplatz_id: stellplatz.id,
        standort_id: stellplatz.standort_id,
        aktualisiert_am: new Date(),
      });

      // Update spot status
      await trx('stellplaetze').where({ id: stellplatz.id }).update({ status: 'belegt' });

      // Log
      await trx('fahrzeug_position_history').insert({
        id: uuidv4(),
        fahrzeug_id,
        stellplatz_id: stellplatz.id,
        stellplatz_bezeichnung: stellplatz.bezeichnung,
        standort_id: stellplatz.standort_id,
        nutzer_id: req.user.id,
        scan_methode: 'qr',
      });
    });

    logger.info(`QR-Scan: Fahrzeug ${fahrzeug.intern_nummer} -> Stellplatz ${stellplatz.bezeichnung}`, {
      user: req.user.id,
    });

    res.json({
      message: 'Position aktualisiert',
      fahrzeug: { id: fahrzeug.id, intern_nummer: fahrzeug.intern_nummer },
      stellplatz: { id: stellplatz.id, bezeichnung: stellplatz.bezeichnung },
    });
  } catch (err) {
    next(err);
  }
}

async function generateRaster(req, res, next) {
  try {
    const { standort_id, zeilen, spalten, prefix, bereich } = req.body;
    const created = [];

    for (let z = 0; z < zeilen; z++) {
      for (let s = 0; s < spalten; s++) {
        const zBuchstabe = String.fromCharCode(65 + z); // A, B, C...
        const bezeichnung = `${prefix || ''}${zBuchstabe}${String(s + 1).padStart(2, '0')}`;

        const existing = await db('stellplaetze').where({ standort_id, zeile: z, spalte: s }).first();
        if (existing) continue;

        const id = uuidv4();
        const qr_code_token = uuidv4();
        await db('stellplaetze').insert({
          id, standort_id, bezeichnung, zeile: z, spalte: s,
          bereich: bereich || 'Standard', qr_code_token,
        });
        created.push({ id, bezeichnung });
      }
    }

    // Update standort raster dimensions
    await db('standorte').where({ id: standort_id }).update({
      raster_zeilen: zeilen,
      raster_spalten: spalten,
    });

    res.json({ message: `${created.length} Stellplätze erstellt`, created });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, raster, get, create, update, scan, generateRaster };
