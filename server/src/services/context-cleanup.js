const { Op } = require('sequelize');

let cleanupInterval = null;

function startContextCleanup(getModels) {
  if (cleanupInterval) return; // Already running

  const runCleanup = async () => {
    try {
      const { SessionContext } = getModels();
      if (!SessionContext) return;

      const now = new Date();
      const contexts = await SessionContext.findAll({
        where: {
          ttlHours: { [Op.ne]: null }
        },
        attributes: ['id', 'updatedAt', 'ttlHours']
      });

      let deletedCount = 0;
      for (const ctx of contexts) {
        const expiresAt = new Date(ctx.updatedAt).getTime() + ctx.ttlHours * 3600000;
        if (now.getTime() > expiresAt) {
          await ctx.destroy();
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`[context-cleanup] Deleted ${deletedCount} expired session contexts`);
      }
    } catch (err) {
      console.error('[context-cleanup] Error:', err.message);
    }
  };

  // Run every hour
  cleanupInterval = setInterval(runCleanup, 3600000);
  
  // Run once at startup (after a brief delay to let DB connect)
  setTimeout(runCleanup, 5000);
}

function stopContextCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

module.exports = {
  startContextCleanup,
  stopContextCleanup
};