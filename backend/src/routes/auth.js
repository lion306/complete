const router = require('express').Router();
const { login, refresh, logout, me, changePassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, me);
router.put('/change-password', authenticate, changePassword);

module.exports = router;
