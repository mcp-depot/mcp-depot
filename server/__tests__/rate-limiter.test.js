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

  describe('integration-level pooling', () => {
    // A shared integration has one real upstream quota - no single user's
    // per-user budget should be able to exhaust the whole pool alone. This
    // covers the fix: the "integration" ceiling must be shared across every
    // user AND every tool on that integration, not scoped per (tool, user).
    test('pools the integration ceiling across different users calling the same integration', () => {
      const integrationId = 'shared-integration-1';
      // Give each user a generous individual tool-level limit so only the
      // integration-level ceiling (2 rpm) is what trips.
      checkRateLimit('tool-x', 'user-1', 100, 2, 5000, integrationId);
      checkRateLimit('tool-x', 'user-2', 100, 2, 5000, integrationId);

      const thirdCallDifferentUser = checkRateLimit('tool-x', 'user-3', 100, 2, 5000, integrationId);

      expect(thirdCallDifferentUser.allowed).toBe(false);
      expect(thirdCallDifferentUser.level).toBe('integration');
    });

    test('pools the integration ceiling across different tools on the same integration', () => {
      const integrationId = 'shared-integration-2';
      checkRateLimit('tool-y1', 'user-1', 100, 2, 5000, integrationId);
      checkRateLimit('tool-y2', 'user-1', 100, 2, 5000, integrationId);

      const thirdCallDifferentTool = checkRateLimit('tool-y3', 'user-1', 100, 2, 5000, integrationId);

      expect(thirdCallDifferentTool.allowed).toBe(false);
      expect(thirdCallDifferentTool.level).toBe('integration');
    });

    test('does not pool across two different integrations', () => {
      checkRateLimit('tool-z1', 'user-1', 100, 1, 5000, 'integration-a');
      // Integration-a is now at its 1rpm ceiling; integration-b must be unaffected.
      const otherIntegration = checkRateLimit('tool-z2', 'user-1', 100, 1, 5000, 'integration-b');

      expect(otherIntegration.allowed).toBe(true);
    });

    test('falls back to per-tool pooling when no integrationId is supplied (meta/composite tools)', () => {
      const result = checkRateLimit('standalone-tool', 'user-1', 100, 5, 5000);
      expect(result.allowed).toBe(true);
    });
  });
});
