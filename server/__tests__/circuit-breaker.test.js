const circuitBreaker = require('../src/services/circuit-breaker');

describe('Circuit breaker', () => {
  test('is closed (not open) for an integration with no recorded failures', () => {
    expect(circuitBreaker.isOpen('fresh-integration')).toBe(false);
  });

  test('is a no-op for a falsy integrationId (meta/composite tools with no backing integration)', () => {
    expect(circuitBreaker.isOpen(null)).toBe(false);
    expect(() => circuitBreaker.recordFailure(null)).not.toThrow();
    expect(() => circuitBreaker.recordSuccess(undefined)).not.toThrow();
  });

  test('opens after reaching the failure threshold, and reports it in getStatus', () => {
    const id = 'flaky-integration-' + Date.now();
    for (let i = 0; i < 5; i++) circuitBreaker.recordFailure(id);

    expect(circuitBreaker.isOpen(id)).toBe(true);

    const status = circuitBreaker.getStatus().find(s => s.integrationId === id);
    expect(status).toBeDefined();
    expect(status.open).toBe(true);
    expect(status.failures).toBe(5);
  });

  test('does not open before reaching the threshold', () => {
    const id = 'mostly-healthy-integration-' + Date.now();
    circuitBreaker.recordFailure(id);
    circuitBreaker.recordFailure(id);

    expect(circuitBreaker.isOpen(id)).toBe(false);
  });

  test('a success resets the failure count entirely', () => {
    const id = 'recovering-integration-' + Date.now();
    circuitBreaker.recordFailure(id);
    circuitBreaker.recordFailure(id);
    circuitBreaker.recordFailure(id);
    circuitBreaker.recordFailure(id);

    circuitBreaker.recordSuccess(id);

    expect(circuitBreaker.isOpen(id)).toBe(false);
    expect(circuitBreaker.getStatus().find(s => s.integrationId === id)).toBeUndefined();

    // One more failure after a reset should not immediately reopen it
    circuitBreaker.recordFailure(id);
    expect(circuitBreaker.isOpen(id)).toBe(false);
  });

  test('tracks multiple integrations independently', () => {
    const idA = 'independent-a-' + Date.now();
    const idB = 'independent-b-' + Date.now();
    for (let i = 0; i < 5; i++) circuitBreaker.recordFailure(idA);

    expect(circuitBreaker.isOpen(idA)).toBe(true);
    expect(circuitBreaker.isOpen(idB)).toBe(false);
  });
});
