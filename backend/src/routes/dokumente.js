const router = require('express').Router();
const db = require('../config/database');
const path = require('path');
const { authenticate, requirePermission } = require('../middleware/auth');
const pdfService = require('../services/pdfService');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

// List documents for a vehicle
router.get('/fahrzeug/:fahrzeug_id', async (req, res, next) => {
  try {
    const docs = await db('fahrzeug_dokumente')
      .where({ fahrzeug_id: req.params.fahrzeug_id })
      .orderBy('erstellt_am', 'desc');
    res.json(docs);
  } catch (e) { next(e); }
});

// Generate PDF document
router.post('/generieren', requirePermission('perm_dokument_generieren'), async (req, res, next) => {
  try {
    const { fahrzeug_id, typ, extra } = req.body;
    const validTypes = ['expose', 'probefahrtvertrag', 'kaufvertrag'];
    if (!validTypes.includes(typ)) {
      return res.status(400).json({ error: 'Ungültiger Dokumenttyp', valid: validTypes });
    }

    const { filename, pfad, pdfBuffer } = await pdfService.generatePDF(typ, fahrzeug_id, extra || {});

    const id = uuidv4();
    await db('fahrzeug_dokumente').insert({
      id, fahrzeug_id, typ,
      bezeichnung: `${typ} - ${new Date().toLocaleDateString('de-DE')}`,
      dateiname: filename,
      pfad,
      groesse_bytes: pdfBuffer.length,
      generiert: true,
      hochgeladen_von: req.user.id,
    });

    res.json({ id, filename, pfad, message: 'PDF erstellt' });
  } catch (e) { next(e); }
});

// Preview HTML (no PDF generation)
router.post('/vorschau', async (req, res, next) => {
  try {
    const { fahrzeug_id, typ, extra } = req.body;
    const html = await pdfService.generateHtmlPreview(typ || 'expose', fahrzeug_id, extra || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { next(e); }
});

// Download PDF
router.get('/:id/download', async (req, res, next) => {
  try {
    const doc = await db('fahrzeug_dokumente').where({ id: req.params.id }).first();
    if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden' });

    const UPLOAD_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
    const filepath = path.join(UPLOAD_DIR, doc.pfad);
    res.download(filepath, doc.dateiname);
  } catch (e) { next(e); }
});

// Templates management
router.get('/templates', async (req, res, next) => {
  try {
    const templates = await db('pdf_templates').where({ aktiv: true }).orderBy('typ');
    res.json(templates);
  } catch (e) { next(e); }
});

router.post('/templates', requirePermission('perm_admin'), async (req, res, next) => {
  try {
    const id = uuidv4();
    await db('pdf_templates').insert({ id, erstellt_von: req.user.id, ...req.body });
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

router.put('/templates/:id', requirePermission('perm_admin'), async (req, res, next) => {
  try {
    await db('pdf_templates').where({ id: req.params.id }).update({ ...req.body, aktualisiert_am: new Date() });
    res.json({ message: 'Template aktualisiert' });
  } catch (e) { next(e); }
});

module.exports = router;
