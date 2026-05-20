const express = require('express');
const router = express.Router();
const { bookingController } = require('../controllers');
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');

// NOTE: /my-bookings phải đặt TRƯỚC /:id để tránh conflict
router.post('/', protect, bookingController.createBooking);
router.get('/my-bookings', protect, bookingController.getMyBookings);
router.get('/:id', protect, bookingController.getBookingById);
router.put('/:id/cancel', protect, bookingController.cancelBooking);

// Admin routes - phải đặt SAU các user routes
router.get('/admin/all', protect, admin, bookingController.getAllBookings);
router.put('/:id/status', protect, admin, bookingController.updateBookingStatus);
router.get('/stats/admin', protect, admin, bookingController.getBookingStats);

module.exports = router;
