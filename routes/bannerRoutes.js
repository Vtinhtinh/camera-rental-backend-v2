const express = require('express');
const router = express.Router();
const { bannerController } = require('../controllers');
const { protect, optionalAuth } = require('../middleware/auth');
const { admin } = require('../middleware/admin');

router.get('/', optionalAuth, bannerController.getActiveBanners);
router.get('/all', protect, admin, bannerController.getAllBanners);
router.get('/:id', bannerController.getBannerById);

router.post('/', protect, admin, bannerController.createBanner);
router.put('/:id', protect, admin, bannerController.updateBanner);
router.delete('/:id', protect, admin, bannerController.deleteBanner);
router.put('/reorder', protect, admin, bannerController.reorderBanners);

module.exports = router;
