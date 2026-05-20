const express = require('express');
const router = express.Router();
const { chatWithAI } = require('../controllers/chatController');

// Chat endpoint - nhận tin nhắn và trả lời bằng Gemini
router.post('/', chatWithAI);

module.exports = router;
