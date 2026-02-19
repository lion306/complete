const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const exportService = require('../services/exportService');
const path = require('path');
const fs = require('fs');

router.use(authenticate);
router.use(requirePermission('perm_export_boersen'));

// Export to Mobile.de (XML)
router.post('/mobilede', async (req, res, next) => {
  try {
    const { fahrzeug_ids } = req.body;
    if (!fahrzeug_ids?.length) {
      return res.status(400).json({ error: 'Keine Fahrzeug-IDs angegeben' });
    }
    const result = await exportService.exportToMobileDe(fahrzeug_ids);
    res.json(result);
  } catch (e) { next(e); }
});

// Export to AutoScout24 (CSV)
router.post('/autoscout', async (req, res, next) => {
  try {
    const { fahrzeug_ids } = req.body;
    if (!fahrzeug_ids?.length) {
      return res.status(400).json({ error: 'Keine Fahrzeug-IDs angegeben' });
    }
    const result = await exportService.exportToAutoScout(fahrzeug_ids);
    res.json(result);
  } catch (e) { next(e); }
});

// Download export file
router.get('/download/:filename', async (req, res, next) => {
  try {
    const UPLOAD_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
    const filepath = path.join(UPLOAD_DIR, 'exports', req.params.filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }
    res.download(filepath);
  } catch (e) { next(e); }
});

module.exports = router;
