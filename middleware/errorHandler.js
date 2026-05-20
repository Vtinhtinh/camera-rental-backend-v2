const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Lỗi server nội bộ';

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    message = messages.join(', ');
    statusCode = 400;
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    message = `${field} đã tồn tại trong hệ thống`;
    statusCode = 400;
  }

  if (err.name === 'CastError') {
    message = 'ID không hợp lệ';
    statusCode = 400;
  }

  if (err.name === 'JsonWebTokenError') {
    message = 'Token không hợp lệ';
    statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    message = 'Token đã hết hạn';
    statusCode = 401;
  }

  console.error('Error Handler:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const notFound = (req, res, next) => {
  const error = new AppError(`Không tìm thấy: ${req.originalUrl}`, 404);
  next(error);
};

module.exports = { errorHandler, AppError, notFound };
