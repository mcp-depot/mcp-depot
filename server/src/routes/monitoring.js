const express = require('express');
const { Op } = require('sequelize');
const { auth } = require('../middleware/auth');
const logger = require('../services/logger');
const { loadModels, sequelize } = require('../config/database');

const router = express.Router();

router.get('/stats', auth, async (req, res) => {
  try {
    const { ToolCall, Tool, Integration } = loadModels();
    const currentUserId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    
    // Admin sees all calls; regular users see their tools/integrations
    let whereClause;
    
    if (isAdmin) {
      whereClause = {};
    } else {
      // Get user's tools
      const userTools = await Tool.findAll({
        where: { userId: currentUserId },
        attributes: ['id'],
        raw: true
      });
      const userToolIds = userTools.map(t => t.id);
      
      // Get user's integrations
      const userIntegrations = await Integration.findAll({
        where: { userId: currentUserId },
        attributes: ['id'],
        raw: true
      });
      const userIntegrationIds = userIntegrations.map(i => i.id);
      
      // Filter to user's tools and integrations
      whereClause = {
        [Op.or]: [
          { toolId: { [Op.in]: userToolIds } },
          { integrationId: { [Op.in]: userIntegrationIds } }
        ]
      };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today - 24 * 60 * 60 * 1000);
    const last7Days = new Date(today - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(today - 30 * 24 * 60 * 60 * 1000);
    
    const [
      totalCalls,
      todayCalls,
      last7DaysCalls,
      last30DaysCalls,
      successCount,
      failureCount,
      avgResult,
      topToolsRaw,
      topIntegrationsRaw,
      callsByCallerType
    ] = await Promise.all([
      ToolCall.count({ where: whereClause }),
      ToolCall.count({ where: { ...whereClause, createdAt: { [Op.gte]: today } } }),
      ToolCall.count({ 
        where: { ...whereClause, createdAt: { [Op.gte]: last7Days } } 
      }),
      ToolCall.count({ 
        where: { ...whereClause, createdAt: { [Op.gte]: last30Days } } 
      }),
      ToolCall.count({ where: { ...whereClause, success: true } }),
      ToolCall.count({ where: { ...whereClause, success: false } }),
      ToolCall.findOne({
        where: { ...whereClause, responseTime: { [Op.gt]: 0 } },
        attributes: [[sequelize.fn('AVG', sequelize.col('responseTime')), 'avgTime']],
        raw: true
      }),
      ToolCall.findAll({
        where: whereClause,
        attributes: ['toolId', [sequelize.fn('COUNT', sequelize.col('id')), 'callCount']],
        group: ['toolId'],
        order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
        limit: 10,
        raw: true
      }),
      ToolCall.findAll({
        where: whereClause,
        attributes: ['integrationId', [sequelize.fn('COUNT', sequelize.col('id')), 'callCount']],
        group: ['integrationId'],
        order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
        limit: 10,
        raw: true
      }),
      ToolCall.findAll({
        where: whereClause,
        attributes: ['callerType', [sequelize.fn('COUNT', sequelize.col('id')), 'callCount']],
        group: ['callerType'],
        raw: true
      })
    ]);

    const yesterdayCalls = await ToolCall.count({ 
      where: { ...whereClause, createdAt: { [Op.gte]: yesterday, [Op.lt]: today } } 
    });

    const toolIds = topToolsRaw.map(t => t.toolId);
    const tools = toolIds.length > 0 ? await Tool.findAll({ 
      where: { id: { [Op.in]: toolIds } },
      attributes: ['id', 'name'],
      raw: true
    }) : [];
    const toolMap = tools.reduce((acc, t) => { acc[t.id] = t.name; return acc; }, {});

    const intIds = topIntegrationsRaw.map(i => i.integrationId);
    const integrations = intIds.length > 0 ? await Integration.findAll({ 
      where: { id: { [Op.in]: intIds } },
      attributes: ['id', 'name'],
      raw: true
    }) : [];
    const intMap = integrations.reduce((acc, i) => { acc[i.id] = i.name; return acc; }, {});

    const successRate = totalCalls > 0 ? ((successCount / totalCalls) * 100).toFixed(1) : 0;
    
    res.json({
      overview: {
        totalCalls,
        todayCalls,
        yesterdayCalls,
        last7Days: last7DaysCalls,
        last30Days: last30DaysCalls,
        successCount,
        failureCount,
        successRate: parseFloat(successRate),
        avgResponseTime: avgResult?.avgTime ? Math.round(parseFloat(avgResult.avgTime)) : 0
      },
      topTools: topToolsRaw.map(t => ({
        toolId: t.toolId,
        toolName: toolMap[t.toolId] || 'Unknown',
        callCount: parseInt(t.callCount)
      })),
      topIntegrations: topIntegrationsRaw.map(i => ({
        integrationId: i.integrationId,
        integrationName: intMap[i.integrationId] || 'Unknown',
        callCount: parseInt(i.callCount)
      })),
      callsByCallerType
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Get stats failed');
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

router.get('/history-chart', auth, async (req, res) => {
  try {
    const { ToolCall, Tool, Integration } = loadModels();
    const currentUserId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    
    let whereClause;
    
    if (isAdmin) {
      whereClause = {};
    } else {
      const userTools = await Tool.findAll({
        where: { userId: currentUserId },
        attributes: ['id'],
        raw: true
      });
      const userToolIds = userTools.map(t => t.id);
      
      const userIntegrations = await Integration.findAll({
        where: { userId: currentUserId },
        attributes: ['id'],
        raw: true
      });
      const userIntegrationIds = userIntegrations.map(i => i.id);
      
      whereClause = {
        [Op.or]: [
          { toolId: { [Op.in]: userToolIds } },
          { integrationId: { [Op.in]: userIntegrationIds } }
        ]
      };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7Days = new Date(today - 6 * 24 * 60 * 60 * 1000);

    const dailyData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today - i * 24 * 60 * 60 * 1000);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const count = await ToolCall.count({
        where: {
          ...whereClause,
          createdAt: {
            [Op.gte]: date,
            [Op.lt]: nextDate
          }
        }
      });
      
      dailyData.push({
        date: date.toISOString().split('T')[0],
        calls: count
      });
    }

    res.json(dailyData);
  } catch (error) {
    logger.error({ error: error.message }, 'Get history chart failed');
    res.status(500).json({ error: 'Failed to get history chart' });
  }
});

router.get('/history', auth, async (req, res) => {
  try {
    const { ToolCall, Tool, Integration } = loadModels();
    const currentUserId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const { 
      page = 1, 
      limit = 20, 
      toolId, 
      integrationId, 
      success, 
      callerType,
      startDate,
      endDate
    } = req.query;
    
    let baseWhere;
    
    if (isAdmin) {
      // Admin sees all
      baseWhere = {};
    } else {
      // Regular users see only their tools/integrations
      const userTools = await Tool.findAll({
        where: { userId: currentUserId },
        attributes: ['id'],
        raw: true
      });
      const userToolIds = userTools.map(t => t.id);
      
      const userIntegrations = await Integration.findAll({
        where: { userId: currentUserId },
        attributes: ['id'],
        raw: true
      });
      const userIntegrationIds = userIntegrations.map(i => i.id);
      
      baseWhere = {
        [Op.or]: [
          { toolId: { [Op.in]: userToolIds } },
          { integrationId: { [Op.in]: userIntegrationIds } }
        ]
      };
    }
    
    const where = { ...baseWhere };
    
    if (toolId) where.toolId = toolId;
    if (integrationId) where.integrationId = integrationId;
    if (success !== undefined) where.success = success === 'true';
    if (callerType) where.callerType = callerType;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const pageLimit = parseInt(limit);
    
    const { count, rows } = await ToolCall.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: pageLimit,
      offset,
      raw: true
    });
    
    const toolIds = [...new Set(rows.map(r => r.toolId).filter(Boolean))];
    const intIds = [...new Set(rows.map(r => r.integrationId).filter(Boolean))];
    
    const { Tool: ToolModel, Integration: IntModel2 } = loadModels();
    
    const tools = toolIds.length > 0 ? await ToolModel.findAll({ 
      where: { id: { [Op.in]: toolIds } },
      attributes: ['id', 'name'],
      raw: true
    }) : [];
    const toolMap = tools.reduce((acc, t) => { acc[t.id] = t.name; return acc; }, {});
    
    const integrations = intIds.length > 0 ? await IntModel2.findAll({ 
      where: { id: { [Op.in]: intIds } },
      attributes: ['id', 'name', 'type'],
      raw: true
    }) : [];
    const intMap = integrations.reduce((acc, i) => { acc[i.id] = { name: i.name, type: i.type }; return acc; }, {});
    
    const calls = rows.map(c => ({
      id: c.id,
      toolId: c.toolId,
      toolName: toolMap[c.toolId] || 'Unknown',
      integrationId: c.integrationId,
      integrationName: intMap[c.integrationId]?.name || 'Unknown',
      integrationType: intMap[c.integrationId]?.type,
      method: c.method,
      path: c.path,
      callerId: c.callerId,
      callerType: c.callerType,
      requestBody: c.requestBody,
      queryParams: c.queryParams,
      responseStatus: c.responseStatus,
      responseBody: c.responseBody,
      responseTime: c.responseTime,
      success: c.success,
      errorMessage: c.errorMessage,
      ipAddress: c.ipAddress,
      createdAt: c.createdAt
    }));
    
    res.json({
      calls,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: pageLimit,
        pages: Math.ceil(count / pageLimit)
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Get history failed');
    res.status(500).json({ error: 'Failed to get history' });
  }
});

router.get('/tool/:toolId/stats', auth, async (req, res) => {
  try {
    const { ToolCall, Tool } = loadModels();
    const userId = req.user.id;
    const { toolId } = req.params;
    
    const tool = await Tool.findOne({ where: { id: toolId, userId } });
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7Days = new Date(today - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(today - 30 * 24 * 60 * 60 * 1000);
    
    const [total, todayCalls, last7DaysCalls, last30DaysCalls, successCount, failureCount] = await Promise.all([
      ToolCall.count({ where: { toolId, userId } }),
      ToolCall.count({ where: { toolId, userId, createdAt: { [Op.gte]: today } } }),
      ToolCall.count({ 
        where: { toolId, userId, createdAt: { [Op.gte]: last7Days } } 
      }),
      ToolCall.count({ 
        where: { toolId, userId, createdAt: { [Op.gte]: last30Days } } 
      }),
      ToolCall.count({ where: { toolId, userId, success: true } }),
      ToolCall.count({ where: { toolId, userId, success: false } })
    ]);
    
    const avgResponseTime = await ToolCall.findOne({
      where: { toolId, userId, responseTime: { [Op.gt]: 0 } },
      attributes: [[sequelize.fn('AVG', sequelize.col('responseTime')), 'avgTime']],
      raw: true
    });
    
    const recentErrors = await ToolCall.findAll({
      where: { toolId, userId, success: false },
      attributes: ['id', 'errorMessage', 'responseStatus', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 10,
      raw: true
    });
    
    res.json({
      toolId,
      toolName: tool.name,
      totalCalls: total,
      todayCalls,
      last7Days: last7DaysCalls,
      last30Days: last30DaysCalls,
      successCount,
      failureCount,
      successRate: total > 0 ? ((successCount / total) * 100).toFixed(1) : 0,
      avgResponseTime: avgResponseTime?.avgTime ? Math.round(parseFloat(avgResponseTime.avgTime)) : 0,
      recentErrors
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Get tool stats failed');
    res.status(500).json({ error: 'Failed to get tool stats' });
  }
});

router.post('/replay/:callId', auth, async (req, res) => {
  try {
    const { ToolCall, Tool, Integration } = loadModels();
    const currentUserId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    
    const toolCall = await ToolCall.findByPk(req.params.callId);
    if (!toolCall) {
      return res.status(404).json({ error: 'Tool call not found' });
    }
    
    const tool = await Tool.findByPk(toolCall.toolId);
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }
    
    if (!isAdmin && tool.userId !== currentUserId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const integration = await Integration.findByPk(toolCall.integrationId);
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }
    
    const AdapterFactory = require('../adapters');
    const adapter = AdapterFactory.create(integration.type, integration.config);
    
    const params = { ...toolCall.queryParams, ...toolCall.requestBody };
    const method = (tool.endpoint?.method || 'GET').toUpperCase();
    let path = tool.endpoint?.path || '';
    
    for (const [key, value] of Object.entries(params || {})) {
      if (path.includes(`{${key}}`)) {
        path = path.replace(`{${key}}`, encodeURIComponent(value));
      }
    }
    
    let result;
    try {
      switch (method) {
        case 'GET':
          result = await adapter.get(path, { params: toolCall.queryParams });
          break;
        case 'POST':
          result = await adapter.post(path, toolCall.requestBody);
          break;
        case 'PUT':
          result = await adapter.put(path, toolCall.requestBody);
          break;
        case 'DELETE':
          result = await adapter.delete(path, { params: toolCall.queryParams });
          break;
        case 'PATCH':
          result = await adapter.patch(path, toolCall.requestBody);
          break;
        default:
          return res.status(400).json({ error: 'Unsupported method' });
      }
      res.json({ success: true, result: result.data || result });
    } catch (apiError) {
      res.json({ 
        success: false, 
        error: apiError.message,
        status: apiError.response?.status 
      });
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Replay tool call failed');
    res.status(500).json({ error: 'Failed to replay tool call: ' + error.message });
  }
});

module.exports = router;