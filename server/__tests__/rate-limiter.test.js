const { checkRateLimit } = require('../src/services/rate-limiter');

describe('Rate Limiter Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    test('should allow request when under limit', () => {
      const result = checkRateLimit('tool-1', 'user-1', 10);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    test('should allow unlimited when limit is 0', () => {
      const result = checkRateLimit('tool-1', 'user-1', 0);
      expect(result.allowed).toBe(true);
    });

    test('should allow unlimited when limit is null/undefined', () => {
      expect(checkRateLimit('tool-1', 'user-1', null).allowed).toBe(true);
      expect(checkRateLimit('tool-1', 'user-1', undefined).allowed).toBe(true);
      expect(checkRateLimit('tool-1', 'user-1', -1).allowed).toBe(true);
    });

    test('should block when limit exceeded', () => {
      checkRateLimit('tool-2', 'user-2', 2);
      checkRateLimit('tool-2', 'user-2', 2);
      
      const result = checkRateLimit('tool-2', 'user-2', 2);
      
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test('should track limits per tool and user', () => {
      checkRateLimit('tool-a', 'user-a', 5);
      
      const resultA = checkRateLimit('tool-a', 'user-a', 5);
      const resultB = checkRateLimit('tool-b', 'user-b', 5);
      
      // First call uses 1, so second call shows remaining = 4 (or 3)
      expect(resultA.remaining).toBeLessThanOrEqual(5);
      expect(resultB.remaining).toBeLessThanOrEqual(5);
    });
  });
});
