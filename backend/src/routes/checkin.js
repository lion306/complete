/**
 * Mobile Check-in Routes
 * Handles vehicle arrival inspection, photo capture, and PWA manifest
 */
const router  = require('express').Router();
const multer  = require('multer');
const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');
const db      = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');

const UPLOAD_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

// Multer for mobile photo uploads (memory storage for immediate processing)
const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\//i.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Nur Bilddateien erlaubt'));
  },
});

router.use(authenticate);

// ── Start new check-in session ────────────────────────────────────────────────
router.post('/start', async (req, res, next) => {
  try {
    const { fahrzeug_id, typ, ort, kilometerstand, tankfuellung,
            zustand_extern, zustand_intern, latitude, longitude } = req.body;

    const fz = await db('fahrzeuge').where({ id: fahrzeug_id }).first();
    if (!fz) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });

    const id = uuidv4();
    await db('checkin_protokolle').insert({
      id, fahrzeug_id, typ: typ || 'anlieferung',
      nutzer_id: req.user.id, ort, kilometerstand, tankfuellung,
      zustand_extern, zustand_intern, latitude, longitude,
    });

    // Update fahrzeug check-in data
    await db('fahrzeuge').where({ id: fahrzeug_id }).update({
      checkin_nutzer_id:  req.user.id,
      checkin_zeitpunkt:  new Date(),
      checkin_ort:        ort,
      aktualisiert_am:    new Date(),
      ...(kilometerstand ? { kilometer: kilometerstand } : {}),
    });

    res.status(201).json({ id, message: 'Check-in gestartet' });
  } catch (err) { next(err); }
});

// ── Upload photos during check-in ─────────────────────────────────────────────
router.post('/:checkin_id/fotos', upload.array('fotos', 20), async (req, res, next) => {
  try {
    const checkin = await db('checkin_protokolle').where({ id: req.params.checkin_id }).first();
    if (!checkin) return res.status(404).json({ error: 'Check-in nicht gefunden' });

    const { fahrzeug_id } = checkin;
    const { kategorie = 'anlieferung' } = req.body;

    const fotoDir = path.join(UPLOAD_DIR, 'fahrzeuge', fahrzeug_id, kategorie);
    const thumbDir = path.join(UPLOAD_DIR, 'fahrzeuge', fahrzeug_id, 'thumbnails');
    [fotoDir, thumbDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

    const maxPos = await db('fahrzeug_fotos')
      .where({ fahrzeug_id }).max('position as m').first();
    let pos = parseInt(maxPos?.m ?? -1) + 1;

    const created = [];
    for (const file of (req.files || [])) {
      const filename  = `${uuidv4()}.jpg`;
      const finalPath = path.join(fotoDir, filename);
      const thumbPath = path.join(thumbDir, `thumb_${filename}`);

      // Process with sharp (auto-rotate, optimize for mobile uploads)
      await sharp(file.buffer)
        .rotate()
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(finalPath);

      await sharp(file.buffer)
        .rotate()
        .resize(400, 300, { fit: 'cover' })
        .jpeg({ quality: 70 })
        .toFile(thumbPath);

      const relPath  = path.relative(UPLOAD_DIR, finalPath);
      const thumbRel = path.relative(UPLOAD_DIR, thumbPath);
      const stat     = fs.statSync(finalPath);

      const fotoId = uuidv4();
      await db('fahrzeug_fotos').insert({
        id:              fotoId,
        fahrzeug_id,
        dateiname:       filename,
        pfad:            relPath,
        thumbnail_pfad:  thumbRel,
        kategorie,
        position:        pos++,
        groesse_bytes:   stat.size,
        hochgeladen_von: req.user.id,
      });
      created.push({ id: fotoId, pfad: relPath, thumbnail_pfad: thumbRel });
    }

    // Append foto IDs to check-in record
    const existing = checkin.foto_ids || [];
    await db('checkin_protokolle').where({ id: req.params.checkin_id }).update({
      foto_ids: [...existing, ...created.map(f => f.id)],
    });

    res.status(201).json({ created, count: created.length });
  } catch (err) { next(err); }
});

// ── Complete check-in + optional signature ────────────────────────────────────
router.post('/:checkin_id/abschliessen', async (req, res, next) => {
  try {
    const { unterschrift, unterschrift_name, notizen } = req.body;

    await db('checkin_protokolle').where({ id: req.params.checkin_id }).update({
      abgeschlossen:  true,
      unterschrift,
      unterschrift_name,
      notizen,
    });

    // Move vehicle to first Kanban lane if not already placed
    const checkin = await db('checkin_protokolle').where({ id: req.params.checkin_id }).first();
    const fz      = await db('fahrzeuge').where({ id: checkin.fahrzeug_id }).first();

    if (!fz.kanban_lane_id) {
      const firstLane = await db('kanban_lanes')
        .whereNull('standort_id')
        .orderBy('position')
        .first();
      if (firstLane) {
        await db('fahrzeuge').where({ id: checkin.fahrzeug_id }).update({
          kanban_lane_id:  firstLane.id,
          kanban_position: 0,
          aktualisiert_am: new Date(),
        });
      }
    }

    res.json({ message: 'Check-in abgeschlossen' });
  } catch (err) { next(err); }
});

// ── Get check-in details ──────────────────────────────────────────────────────
router.get('/:checkin_id', async (req, res, next) => {
  try {
    const cp = await db('checkin_protokolle as cp')
      .leftJoin('nutzer as n', 'n.id', 'cp.nutzer_id')
      .leftJoin('fahrzeuge as f', 'f.id', 'cp.fahrzeug_id')
      .select(
        'cp.*',
        db.raw("n.vorname || ' ' || n.nachname AS nutzer_name"),
        'f.marke', 'f.modell', 'f.vin', 'f.intern_nummer',
      )
      .where('cp.id', req.params.checkin_id)
      .first();

    if (!cp) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(cp);
  } catch (err) { next(err); }
});

// ── List check-ins for a vehicle ──────────────────────────────────────────────
router.get('/fahrzeug/:fahrzeug_id', async (req, res, next) => {
  try {
    const rows = await db('checkin_protokolle as cp')
      .leftJoin('nutzer as n', 'n.id', 'cp.nutzer_id')
      .select('cp.*', db.raw("n.vorname || ' ' || n.nachname AS nutzer_name"))
      .where('cp.fahrzeug_id', req.params.fahrzeug_id)
      .orderBy('cp.erstellt_am', 'desc');
    res.json(rows);
  } catch (err) { next(err); }
});

// ── VIN lookup for mobile check-in ────────────────────────────────────────────
router.get('/vin/:vin', async (req, res, next) => {
  try {
    const fz = await db('fahrzeuge as f')
      .leftJoin('standorte as s', 's.id', 'f.standort_id')
      .select('f.id', 'f.intern_nummer', 'f.vin', 'f.marke', 'f.modell',
              'f.baujahr', 'f.kilometer', 'f.status', 'f.kanban_lane_id',
              's.name as standort_name')
      .whereILike('f.vin', `%${req.params.vin}%`)
      .first();
    if (!fz) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    res.json(fz);
  } catch (err) { next(err); }
});

module.exports = router;
