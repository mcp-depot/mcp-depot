const pino = require('pino');

jest.mock('pino', () => {
  const mockInfo = jest.fn();
  const mockError = jest.fn();
  const mockWarn = jest.fn();
  const mockDebug = jest.fn();
  
  return jest.fn(() => ({
    info: mockInfo,
    error: mockError,
    warn: mockWarn,
    debug: mockDebug,
    child: jest.fn(() => ({
      info: mockInfo,
      error: mockError,
      warn: mockWarn,
      debug: mockDebug
    }))
  }));
});

const logger = require('../src/services/logger');

describe('Logger Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should export a pino logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  test('should have child method for nested loggers', () => {
    expect(typeof logger.child).toBe('function');
    
    const childLogger = logger.child({ component: 'test' });
    expect(childLogger).toBeDefined();
    expect(typeof childLogger.info).toBe('function');
  });

  test('should log info messages', () => {
    logger.info({ userId: '123' }, 'User logged in');
    expect(logger.info).toHaveBeenCalledWith(
      { userId: '123' },
      'User logged in'
    );
  });

  test('should log error messages', () => {
    logger.error({ err: new Error('Test error') }, 'Operation failed');
    expect(logger.error).toHaveBeenCalled();
  });

  test('should log warning messages', () => {
    logger.warn({ remaining: 5 }, 'Rate limit low');
    expect(logger.warn).toHaveBeenCalled();
  });

  test('should log debug messages', () => {
    logger.debug({ query: 'SELECT *' }, 'Executing query');
    expect(logger.debug).toHaveBeenCalled();
  });
});
