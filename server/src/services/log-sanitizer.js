const { sanitizeObject } = require('./sanitize');
const logger = require('./logger');

function sanitizeLog(message, ...args) {
  const sanitizedArgs = args.map(arg => sanitizeObject(arg));
  logger.info(sanitizedArgs, message);
}

function sanitizeErrorLog(message, error) {
  const sanitizedError = {
    message: error.message,
    code: error.code,
    status: error.status,
    ...sanitizeObject(error)
  };

  delete sanitizedError.stack;
  delete sanitizedError.config;
  delete sanitizedError.request;

  logger.error(sanitizedError, message);
}

const LogSanitizer = {
  sanitize: sanitizeObject,
  log: sanitizeLog,
  error: sanitizeErrorLog,

  safeStringify(obj) {
    return JSON.stringify(sanitizeObject(obj));
  }
};

module.exports = LogSanitizer;
