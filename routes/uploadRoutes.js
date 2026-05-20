const express = require('express');
const router = express.Router();
const { uploadImage } = require('../controllers/uploadController');
const { protect, admin } = require('../middleware');

// Public upload endpoint
router.post('/image', uploadImage);

module.exports = router;
