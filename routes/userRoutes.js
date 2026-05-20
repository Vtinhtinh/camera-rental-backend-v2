const express = require('express');
const router = express.Router();
const { userController } = require('../controllers');
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');

router.get('/', protect, admin, userController.getAllUsers);
router.get('/stats', protect, admin, userController.getUserStats);
router.get('/:id', protect, admin, userController.getUserById);
router.put('/:id', protect, admin, userController.updateUser);
router.delete('/:id', protect, admin, userController.deleteUser);
router.get('/:id/bookings', protect, admin, userController.getUserBookings);

module.exports = router;
