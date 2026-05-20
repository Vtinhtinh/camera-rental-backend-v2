const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'Người dùng không tồn tại' });
      }

      if (!req.user.isActive) {
        return res.status(401).json({ message: 'Tài khoản đã bị vô hiệu hóa' });
      }

      next();
    } catch (error) {
      console.error('Auth middleware error:', error.message);
      return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục' });
  }
};

const optionalAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      next();
    } catch (error) {
      next();
    }
  } else {
    next();
  }
};

const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Truy cập bị từ chối. Chỉ quản trị viên được phép.' });
  }
};

module.exports = { protect, optionalAuth, admin };
