const auth = require('./auth');
const admin = require('./admin');
const errorHandler = require('./errorHandler');
const { AppError, notFound } = require('./errorHandler');

module.exports = {
  auth,
  admin,
  errorHandler,
  AppError,
  notFound
};
