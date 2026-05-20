const express = require('express');
const router = express.Router();
const { feedbackController } = require('../controllers');
const { protect, optionalAuth } = require('../middleware/auth');
const { admin } = require('../middleware/admin');

router.get('/', optionalAuth, feedbackController.getFeedbacks);
router.get('/featured', feedbackController.getFeaturedFeedbacks);
router.get('/product/:productId', feedbackController.getFeedbackByProduct);
router.post('/', protect, feedbackController.createFeedback);
router.put('/:id', protect, feedbackController.updateFeedback);
router.delete('/:id', protect, feedbackController.deleteFeedback);
router.put('/:id/reply', protect, admin, feedbackController.replyFeedback);

module.exports = router;
