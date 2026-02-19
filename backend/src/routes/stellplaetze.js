const router = require('express').Router();
const ctrl = require('../controllers/stellplatzController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

router.get('/', ctrl.list);
router.get('/raster/:standort_id', ctrl.raster);
router.get('/:id', ctrl.get);
router.post('/', requirePermission('perm_stellplatz_verwalten'), ctrl.create);
router.put('/:id', requirePermission('perm_stellplatz_verwalten'), ctrl.update);
router.post('/scan', ctrl.scan); // QR scan: assign vehicle to spot
router.post('/generate-raster', requirePermission('perm_stellplatz_verwalten'), ctrl.generateRaster);

module.exports = router;
