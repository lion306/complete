/**
 * Gutachten Routes (PDF Upload + OCR + Schaden-Entscheidungen)
 */
const router   = require('express').Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const db       = require('../config/database');
const ocrSvc   = require('../services/ocrService');
const { v4: uuidv4 } = require('uuid');
const { authenticate, requirePermission } = require('../middleware/auth');
const logger   = require('../utils/logger');

const UPLOAD_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, 'gutachten');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${uuidv4().slice(0, 8)}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.pdf', '.PDF'].includes(path.extname(file.originalname));
    ok ? cb(null, true) : cb(new Error('Nur PDF-Dateien erlaubt'));
  },
});

router.use(authenticate);

// ── List Gutachten for a vehicle ─────────────────────────────────────────────
router.get('/fahrzeug/:fahrzeug_id', async (req, res, next) => {
  try {
    const rows = await db('gutachten as g')
      .leftJoin('nutzer as n', 'n.id', 'g.hochgeladen_von')
      .select('g.*', db.raw("n.vorname || ' ' || n.nachname AS hochgeladen_von_name"))
      .where('g.fahrzeug_id', req.params.fahrzeug_id)
      .orderBy('g.erstellt_am', 'desc');
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Get single Gutachten + Positionen ────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const g = await db('gutachten').where({ id: req.params.id }).first();
    if (!g) return res.status(404).json({ error: 'Gutachten nicht gefunden' });

    const positionen = await db('schaden_positionen as sp')
      .leftJoin('nutzer as n', 'n.id', 'sp.entscheidung_von')
      .select('sp.*', db.raw("n.vorname || ' ' || n.nachname AS entscheider_name"))
      .where('sp.gutachten_id', req.params.id)
      .orderBy('sp.position_nr');

    res.json({ ...g, positionen });
  } catch (err) { next(err); }
});

// ── Upload PDF + trigger OCR ──────────────────────────────────────────────────
router.post('/upload/:fahrzeug_id', upload.single('gutachten'), async (req, res, next) => {
  try {
    const { fahrzeug_id } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

    const fz = await db('fahrzeuge').where({ id: fahrzeug_id }).first();
    if (!fz) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });

    const id = uuidv4();
    const relPath = path.relative(UPLOAD_DIR, file.path);

    await db('gutachten').insert({
      id,
      fahrzeug_id,
      dateiname:       file.originalname,
      pfad:            relPath,
      groesse_bytes:   file.size,
      ocr_status:      'ausstehend',
      hochgeladen_von: req.user.id,
    });

    // Trigger OCR asynchronously
    const fahrzeugInfo = { marke: fz.marke, modell: fz.modell, vin: fz.vin };
    ocrSvc.processPDF(id, file.path, fahrzeugInfo).catch(err => {
      logger.error(`OCR async error for gutachten ${id}:`, err);
    });

    res.status(201).json({
      id,
      dateiname:  file.originalname,
      ocr_status: 'verarbeitung',
      message:    'Gutachten hochgeladen – OCR läuft im Hintergrund',
    });
  } catch (err) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
    next(err);
  }
});

// ── Poll OCR status ────────────────────────────────────────────────────────
router.get('/:id/status', async (req, res, next) => {
  try {
    const g = await db('gutachten')
      .where({ id: req.params.id })
      .select('id', 'ocr_status', 'ocr_kosten_gesamt', 'aktualisiert_am')
      .first();
    if (!g) return res.status(404).json({ error: 'Nicht gefunden' });

    const anzahl = await db('schaden_positionen')
      .where({ gutachten_id: req.params.id })
      .count('id as c')
      .first();

    res.json({ ...g, positionen_anzahl: parseInt(anzahl?.c || 0) });
  } catch (err) { next(err); }
});

// ── Re-trigger OCR ────────────────────────────────────────────────────────────
router.post('/:id/ocr-retry', requirePermission('perm_fahrzeug_bearbeiten'), async (req, res, next) => {
  try {
    const g = await db('gutachten').where({ id: req.params.id }).first();
    if (!g) return res.status(404).json({ error: 'Nicht gefunden' });

    const absPath = path.join(UPLOAD_DIR, g.pfad);
    const fz = await db('fahrzeuge').where({ id: g.fahrzeug_id }).first();

    // Delete old positions
    await db('schaden_positionen').where({ gutachten_id: req.params.id }).delete();

    ocrSvc.processPDF(req.params.id, absPath, { marke: fz?.marke, modell: fz?.modell, vin: fz?.vin })
      .catch(err => logger.error('OCR retry failed:', err));

    res.json({ message: 'OCR neu gestartet' });
  } catch (err) { next(err); }
});

// ── Download PDF ──────────────────────────────────────────────────────────────
router.get('/:id/download', async (req, res, next) => {
  try {
    const g = await db('gutachten').where({ id: req.params.id }).first();
    if (!g) return res.status(404).json({ error: 'Nicht gefunden' });
    res.download(path.join(UPLOAD_DIR, g.pfad), g.dateiname);
  } catch (err) { next(err); }
});

// ── Schaden-Entscheidung setzen ───────────────────────────────────────────────
router.put('/positionen/:id/entscheidung', async (req, res, next) => {
  try {
    const { entscheidung, kundenabzug_betrag, entscheidung_notiz } = req.body;
    const valid = ['ausstehend', 'reparieren', 'ignorieren', 'kundenabzug'];
    if (!valid.includes(entscheidung)) {
      return res.status(400).json({ error: 'Ungültige Entscheidung', valid });
    }

    await db('schaden_positionen').where({ id: req.params.id }).update({
      entscheidung,
      kundenabzug_betrag: entscheidung === 'kundenabzug' ? (kundenabzug_betrag || null) : null,
      entscheidung_notiz,
      entscheidung_von:   req.user.id,
      entscheidung_am:    new Date(),
      aktualisiert_am:    new Date(),
    });

    res.json({ message: 'Entscheidung gespeichert', entscheidung });
  } catch (err) { next(err); }
});

// ── Bulk-Entscheidung (alle auf einmal) ───────────────────────────────────────
router.put('/positionen/bulk-entscheidung', async (req, res, next) => {
  try {
    const { positionen_ids, entscheidung } = req.body;
    const valid = ['reparieren', 'ignorieren', 'kundenabzug'];
    if (!valid.includes(entscheidung) || !positionen_ids?.length) {
      return res.status(400).json({ error: 'Ungültige Eingabe' });
    }
    await db('schaden_positionen')
      .whereIn('id', positionen_ids)
      .update({
        entscheidung,
        entscheidung_von: req.user.id,
        entscheidung_am:  new Date(),
        aktualisiert_am:  new Date(),
      });
    res.json({ message: `${positionen_ids.length} Entscheidungen gespeichert` });
  } catch (err) { next(err); }
});

// ── Add manual damage position ────────────────────────────────────────────────
router.post('/positionen', async (req, res, next) => {
  try {
    const id = uuidv4();
    await db('schaden_positionen').insert({
      id,
      ursprung:     'manuell',
      entscheidung: 'ausstehend',
      ...req.body,
    });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

// ── Schaden-Zusammenfassung für ein Fahrzeug ──────────────────────────────────
router.get('/positionen/fahrzeug/:fahrzeug_id', async (req, res, next) => {
  try {
    const positionen = await db('schaden_positionen as sp')
      .leftJoin('gutachten as g', 'g.id', 'sp.gutachten_id')
      .leftJoin('nutzer as n', 'n.id', 'sp.entscheidung_von')
      .select(
        'sp.*',
        'g.dateiname AS gutachten_dateiname',
        db.raw("n.vorname || ' ' || n.nachname AS entscheider_name"),
      )
      .where('sp.fahrzeug_id', req.params.fahrzeug_id)
      .orderBy(['sp.gutachten_id', 'sp.position_nr']);

    const summary = {
      gesamt:             positionen.length,
      reparieren:         positionen.filter(p => p.entscheidung === 'reparieren'),
      ignorieren:         positionen.filter(p => p.entscheidung === 'ignorieren'),
      kundenabzug:        positionen.filter(p => p.entscheidung === 'kundenabzug'),
      ausstehend:         positionen.filter(p => p.entscheidung === 'ausstehend'),
      kosten_reparatur:   positionen.filter(p => p.entscheidung === 'reparieren').reduce((a, p) => a + (parseFloat(p.kosten_brutto) || 0), 0),
      kosten_kundenabzug: positionen.filter(p => p.entscheidung === 'kundenabzug').reduce((a, p) => a + (parseFloat(p.kundenabzug_betrag) || 0), 0),
    };

    res.json({ positionen, summary });
  } catch (err) { next(err); }
});

module.exports = router;
