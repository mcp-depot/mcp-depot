const { Op } = require('sequelize');
const logger = require('./logger');

const TOOL_CALL_RETENTION_DAYS = parseInt(process.env.TOOL_CALL_RETENTION_DAYS, 10) || 90;
const SESSION_CHANNEL_RETENTION_DAYS = parseInt(process.env.SESSION_CHANNEL_RETENTION_DAYS, 10) || 30;

let cleanupInterval = null;

function startDataRetention(getModels) {
  if (cleanupInterval) return; // Already running

  const runCleanup = async () => {
    try {
      const { ToolCall, SessionChannel } = getModels();

      if (ToolCall) {
        const cutoff = new Date(Date.now() - TOOL_CALL_RETENTION_DAYS * 86400000);
        const deleted = await ToolCall.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
        if (deleted > 0) {
          logger.info({ deleted, retentionDays: TOOL_CALL_RETENTION_DAYS }, 'Purged old tool call records');
        }
      }

      if (SessionChannel) {
        const cutoff = new Date(Date.now() - SESSION_CHANNEL_RETENTION_DAYS * 86400000);
        const deleted = await SessionChannel.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
        if (deleted > 0) {
          logger.info({ deleted, retentionDays: SESSION_CHANNEL_RETENTION_DAYS }, 'Purged old session channel messages');
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Data retention cleanup error');
    }
  };

  // Run once a day
  cleanupInterval = setInterval(runCleanup, 24 * 3600000);

  // Run once at startup (after a brief delay to let DB connect)
  setTimeout(runCleanup, 15000);
}

function stopDataRetention() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

module.exports = { startDataRetention, stopDataRetention };
