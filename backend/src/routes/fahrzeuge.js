const router = require('express').Router();
const ctrl = require('../controllers/fahrzeugController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

router.get('/', ctrl.list);
router.get('/stats', ctrl.stats);
router.get('/:id', ctrl.get);
router.post('/', requirePermission('perm_fahrzeug_anlegen'), ctrl.create);
router.put('/:id', requirePermission('perm_fahrzeug_bearbeiten'), ctrl.update);
router.delete('/:id', requirePermission('perm_fahrzeug_loeschen'), ctrl.remove);
router.post('/:id/status', requirePermission('perm_fahrzeug_bearbeiten'), ctrl.updateStatus);
router.get('/:id/history', ctrl.statusHistory);
router.post('/:id/verkauf', requirePermission('perm_fahrzeug_verkaufen'), ctrl.verkaufen);
router.get('/:id/qr-code', ctrl.getQrCode);

module.exports = router;
