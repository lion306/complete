const router = require('express').Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

// Multer storage: save to temp dir
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmpDir = path.join(UPLOAD_DIR, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error(`Dateityp nicht erlaubt: ${ext}`));
  },
});

router.use(authenticate);

// Upload photos for a vehicle
router.post('/fahrzeug/:fahrzeug_id', upload.array('fotos', 50), async (req, res, next) => {
  try {
    const { fahrzeug_id } = req.params;
    const { kategorie = 'extern' } = req.body;

    const fahrzeug = await db('fahrzeuge').where({ id: fahrzeug_id }).first();
    if (!fahrzeug) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });

    // Target directory: uploads/fahrzeuge/<id>/<kategorie>/
    const fotoDir = path.join(UPLOAD_DIR, 'fahrzeuge', fahrzeug_id, kategorie);
    const thumbDir = path.join(UPLOAD_DIR, 'fahrzeuge', fahrzeug_id, 'thumbnails');
    [fotoDir, thumbDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

    // Get current max position
    const maxPos = await db('fahrzeug_fotos').where({ fahrzeug_id }).max('position as m').first();
    let pos = parseInt(maxPos?.m ?? -1) + 1;

    const created = [];
    for (const file of (req.files || [])) {
      const ext = '.jpg'; // normalize to jpg
      const newFilename = `${uuidv4()}${ext}`;
      const finalPath = path.join(fotoDir, newFilename);
      const thumbPath = path.join(thumbDir, `thumb_${newFilename}`);

      // Convert & optimize with sharp
      await sharp(file.path)
        .rotate() // auto-rotate based on EXIF
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(finalPath);

      // Create thumbnail
      await sharp(file.path)
        .rotate()
        .resize(400, 300, { fit: 'cover' })
        .jpeg({ quality: 70 })
        .toFile(thumbPath);

      // Remove temp file
      fs.unlinkSync(file.path);

      const relPath = path.relative(UPLOAD_DIR, finalPath);
      const thumbRel = path.relative(UPLOAD_DIR, thumbPath);

      const stat = fs.statSync(finalPath);
      const meta = await sharp(finalPath).metadata();

      const id = uuidv4();
      await db('fahrzeug_fotos').insert({
        id,
        fahrzeug_id,
        dateiname: newFilename,
        pfad: relPath,
        thumbnail_pfad: thumbRel,
        kategorie,
        position: pos++,
        groesse_bytes: stat.size,
        breite: meta.width,
        hoehe: meta.height,
        hochgeladen_von: req.user.id,
      });
      created.push({ id, pfad: relPath, thumbnail_pfad: thumbRel });
    }

    res.status(201).json({ created, count: created.length });
  } catch (err) {
    // Clean up temp files
    (req.files || []).forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    next(err);
  }
});

// List photos for a vehicle
router.get('/fahrzeug/:fahrzeug_id', async (req, res, next) => {
  try {
    const fotos = await db('fahrzeug_fotos')
      .where({ fahrzeug_id: req.params.fahrzeug_id })
      .orderBy('position');
    res.json(fotos);
  } catch (e) { next(e); }
});

// Update position / reorder
router.put('/:id/position', async (req, res, next) => {
  try {
    const { position } = req.body;
    await db('fahrzeug_fotos').where({ id: req.params.id }).update({ position });
    res.json({ message: 'Position aktualisiert' });
  } catch (e) { next(e); }
});

// Set as title image (position = 0, shift others)
router.post('/:id/titelbild', async (req, res, next) => {
  try {
    const foto = await db('fahrzeug_fotos').where({ id: req.params.id }).first();
    if (!foto) return res.status(404).json({ error: 'Foto nicht gefunden' });

    await db.transaction(async trx => {
      // Increment all existing pos-0 photos
      await trx('fahrzeug_fotos')
        .where({ fahrzeug_id: foto.fahrzeug_id, position: 0 })
        .where('id', '!=', req.params.id)
        .increment('position', 1);
      await trx('fahrzeug_fotos').where({ id: req.params.id }).update({ position: 0 });
    });

    res.json({ message: 'Als Titelbild gesetzt' });
  } catch (e) { next(e); }
});

// Delete photo
router.delete('/:id', async (req, res, next) => {
  try {
    const foto = await db('fahrzeug_fotos').where({ id: req.params.id }).first();
    if (!foto) return res.status(404).json({ error: 'Foto nicht gefunden' });

    // Delete files
    [foto.pfad, foto.thumbnail_pfad].filter(Boolean).forEach(p => {
      const full = path.join(UPLOAD_DIR, p);
      try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch {}
    });

    await db('fahrzeug_fotos').where({ id: req.params.id }).delete();
    res.json({ message: 'Foto gelöscht' });
  } catch (e) { next(e); }
});

module.exports = router;
