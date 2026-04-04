const { loadModels } = require('../config/database');

const sanitizeValue = (value, maxLength = 1000) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (value.length > maxLength) {
      return value.substring(0, maxLength) + '... [truncated]';
    }
    return value;
  }
  if (typeof value === 'object') {
    const sanitized = {};
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization', 'apikey', 'credential'];
    
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeValue(val, maxLength);
      }
    }
    return sanitized;
  }
  return value;
};

const sanitizeHeaders = (headers) => {
  return sanitizeValue(headers);
};

const logToolCall = async ({
  toolId,
  userId,
  integrationId,
  callerId = null,
  callerType = 'unknown',
  method,
  path,
  requestHeaders = {},
  requestBody = {},
  queryParams = {},
  responseStatus = null,
  responseBody = {},
  responseTime = null,
  errorMessage = null,
  success = true,
  ipAddress = null,
  userAgent = null
}) => {
  try {
    const { ToolCall } = loadModels();
    
    await ToolCall.create({
      toolId,
      userId,
      integrationId,
      callerId,
      callerType,
      method,
      path,
      requestHeaders: sanitizeHeaders(requestHeaders),
      requestBody: sanitizeValue(requestBody),
      queryParams: sanitizeValue(queryParams),
      responseStatus,
      responseBody: sanitizeValue(responseBody, 5000),
      responseTime,
      errorMessage: errorMessage ? errorMessage.substring(0, 2000) : null,
      success,
      ipAddress,
      userAgent: userAgent ? userAgent.substring(0, 500) : null
    });
  } catch (error) {
    console.error('Failed to log tool call:', error.message);
  }
};

module.exports = { logToolCall, sanitizeValue };