const { Op } = require('sequelize');

function ownerWhere(userId, userRole) {
  if (userRole === 'admin') return {};
  return { userId };
}

function readableWhere(userId, userRole) {
  if (userRole === 'admin') return {};
  return {
    [Op.or]: [
      { createdBy: userId },
      { isShared: true },
    ],
  };
}

function ownerWhereId(id, user) {
  return user.role === 'admin' ? { id } : { id, userId: user.id };
}

module.exports = { ownerWhere, readableWhere, ownerWhereId };
