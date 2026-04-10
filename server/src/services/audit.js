const AuditLog = require('../models/AuditLog');
const logger = require('./logger');

class AuditService {
  async log(params) {
    const { userId, action, integrationType, integrationId, details, status, errorMessage } = params;
    
    try {
      const logEntry = await AuditLog.create({
        userId,
        action,
        integrationType,
        integrationId,
        details,
        status,
        errorMessage,
        timestamp: new Date()
      });
      
      return logEntry;
    } catch (error) {
      logger.error({ error: error.message }, 'Audit log error');
    }
  }

  async getLogs(userId, options = {}) {
    const { limit = 50, offset = 0, integrationType, status } = options;
    
    const where = { userId };
    if (integrationType) where.integrationType = integrationType;
    if (status) where.status = status;

    return AuditLog.findAll({
      where,
      order: [['timestamp', 'DESC']],
      offset,
      limit
    });
  }

  async getRecentActivity(userId, limit = 10) {
    return AuditLog.findAll({
      where: { userId },
      order: [['timestamp', 'DESC']],
      limit
    });
  }
}

module.exports = new AuditService();
