const circuitBreaker = require('../src/services/circuit-breaker');

describe('Circuit breaker', () => {
  test('is closed (not open) for an integration with no recorded failures', async () => {
    expect(await circuitBreaker.isOpen('fresh-integration')).toBe(false);
  });

  test('is a no-op for a falsy integrationId (meta/composite tools with no backing integration)', async () => {
    expect(await circuitBreaker.isOpen(null)).toBe(false);
    await expect(circuitBreaker.recordFailure(null)).resolves.not.toThrow();
    await expect(circuitBreaker.recordSuccess(undefined)).resolves.not.toThrow();
  });

  test('opens after reaching the failure threshold, and reports it in getStatus', async () => {
    const id = 'flaky-integration-' + Date.now();
    for (let i = 0; i < 5; i++) await circuitBreaker.recordFailure(id);

    expect(await circuitBreaker.isOpen(id)).toBe(true);

    const status = (await circuitBreaker.getStatus()).find(s => s.integrationId === id);
    expect(status).toBeDefined();
    expect(status.open).toBe(true);
    expect(status.failures).toBe(5);
  });

  test('does not open before reaching the threshold', async () => {
    const id = 'mostly-healthy-integration-' + Date.now();
    await circuitBreaker.recordFailure(id);
    await circuitBreaker.recordFailure(id);

    expect(await circuitBreaker.isOpen(id)).toBe(false);
  });

  test('a success resets the failure count entirely', async () => {
    const id = 'recovering-integration-' + Date.now();
    await circuitBreaker.recordFailure(id);
    await circuitBreaker.recordFailure(id);
    await circuitBreaker.recordFailure(id);
    await circuitBreaker.recordFailure(id);

    await circuitBreaker.recordSuccess(id);

    expect(await circuitBreaker.isOpen(id)).toBe(false);
    expect((await circuitBreaker.getStatus()).find(s => s.integrationId === id)).toBeUndefined();

    // One more failure after a reset should not immediately reopen it
    await circuitBreaker.recordFailure(id);
    expect(await circuitBreaker.isOpen(id)).toBe(false);
  });

  test('tracks multiple integrations independently', async () => {
    const idA = 'independent-a-' + Date.now();
    const idB = 'independent-b-' + Date.now();
    for (let i = 0; i < 5; i++) await circuitBreaker.recordFailure(idA);

    expect(await circuitBreaker.isOpen(idA)).toBe(true);
    expect(await circuitBreaker.isOpen(idB)).toBe(false);
  });
});
