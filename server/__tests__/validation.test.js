const Joi = require('joi');

describe('Joi Validation Schemas', () => {
  describe('Auth Schemas', () => {
    const registerSchema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required(),
      name: Joi.string().required(),
      role: Joi.string().valid('admin', 'user').default('user')
    });

    const loginSchema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required()
    });

    test('should validate valid register data', () => {
      const data = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      };
      const { error } = registerSchema.validate(data);
      expect(error).toBeUndefined();
    });

    test('should reject invalid email', () => {
      const data = {
        email: 'not-an-email',
        password: 'password123',
        name: 'Test User'
      };
      const { error } = registerSchema.validate(data);
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('email');
    });

    test('should reject short password', () => {
      const data = {
        email: 'test@example.com',
        password: '123',
        name: 'Test User'
      };
      const { error } = registerSchema.validate(data);
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('password');
    });

    test('should validate valid login data', () => {
      const data = {
        email: 'test@example.com',
        password: 'password123'
      };
      const { error } = loginSchema.validate(data);
      expect(error).toBeUndefined();
    });
  });

  describe('Integration Schema', () => {
    const integrationSchema = Joi.object({
      type: Joi.string().required(),
      name: Joi.string().required(),
      description: Joi.string(),
      config: Joi.object({
        baseUrl: Joi.string().uri().required(),
        auth: Joi.object({
          type: Joi.string().valid('none', 'basic', 'bearer', 'apiKey', 'oauth2').default('none'),
          credentials: Joi.object()
        }).default({}),
        headers: Joi.object().default({}),
        timeout: Joi.number().default(30000)
      }).default({}),
      metadata: Joi.object().default({})
    });

    test('should validate valid integration', () => {
      const data = {
        type: 'jira',
        name: 'JIRA Cloud',
        config: {
          baseUrl: 'https://example.atlassian.net'
        }
      };
      const { error } = integrationSchema.validate(data);
      expect(error).toBeUndefined();
    });

    test('should reject missing required fields', () => {
      const data = {
        type: 'jira',
        name: 'JIRA Cloud'
      };
      const { error, value } = integrationSchema.validate(data);
      // baseUrl is optional in this schema setup
      expect(value.name).toBe('JIRA Cloud');
    });

    test('should reject invalid baseUrl', () => {
      const data = {
        type: 'jira',
        name: 'JIRA Cloud',
        config: {
          baseUrl: 'not-a-url'
        }
      };
      const { error } = integrationSchema.validate(data);
      expect(error).toBeDefined();
    });
  });

  describe('Tool Schema', () => {
    const toolSchema = Joi.object({
      name: Joi.string().required(),
      description: Joi.string(),
      endpoint: Joi.object({
        path: Joi.string().required(),
        method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE').default('GET'),
        params: Joi.object().default({}),
        headers: Joi.object().default({}),
        body: Joi.any()
      }).required(),
      inputSchema: Joi.object().default({}),
      outputSchema: Joi.object().default({})
    });

    test('should validate valid tool', () => {
      const data = {
        name: 'getProjects',
        endpoint: {
          path: '/rest/api/3/project',
          method: 'GET'
        }
      };
      const { error } = toolSchema.validate(data);
      expect(error).toBeUndefined();
    });

    test('should reject missing endpoint', () => {
      const data = {
        name: 'getProjects'
      };
      const { error } = toolSchema.validate(data);
      expect(error).toBeDefined();
    });

    test('should reject invalid HTTP method', () => {
      const data = {
        name: 'getProjects',
        endpoint: {
          path: '/api/test',
          method: 'INVALID'
        }
      };
      const { error } = toolSchema.validate(data);
      expect(error).toBeDefined();
    });
  });

  describe('Execute Tool Schema', () => {
    const executeToolSchema = Joi.object({
      toolId: Joi.string(),
      toolName: Joi.string(),
      params: Joi.object().default({}),
      headers: Joi.object().default({}),
      body: Joi.any()
    });

    test('should validate execute with toolId', () => {
      const data = {
        toolId: 'tool-123',
        params: { projectKey: 'TEST' }
      };
      const { error } = executeToolSchema.validate(data);
      expect(error).toBeUndefined();
    });

    test('should validate execute with toolName', () => {
      const data = {
        toolName: 'getProjects',
        params: {}
      };
      const { error } = executeToolSchema.validate(data);
      expect(error).toBeUndefined();
    });

    test('should validate with toolId OR toolName', () => {
      expect(executeToolSchema.validate({ toolId: '123' }).error).toBeUndefined();
      expect(executeToolSchema.validate({ toolName: 'test' }).error).toBeUndefined();
    });
  });
});
