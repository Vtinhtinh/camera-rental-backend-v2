const express = require('express');
const router = express.Router();
const { productController } = require('../controllers');
const { protect, optionalAuth } = require('../middleware/auth');
const { admin } = require('../middleware/admin');

router.get('/', optionalAuth, productController.getProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/brands', productController.getBrands);
router.get('/:id', optionalAuth, productController.getProductById);

router.post('/', protect, admin, productController.createProduct);
router.put('/:id', protect, admin, productController.updateProduct);
router.delete('/:id', protect, admin, productController.deleteProduct);
router.get('/stats/admin', protect, admin, productController.getProductStats);

module.exports = router;
