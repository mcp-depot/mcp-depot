delete process.env.REDIS_URL;

const notifyBus = require('../src/services/state/notify-bus');

describe('notify-bus (memory backend, REDIS_URL unset)', () => {
  test('publish calls every locally-registered handler for that topic', () => {
    const received = [];
    notifyBus.subscribe('test-topic-1', (payload) => received.push(payload));
    notifyBus.subscribe('test-topic-1', (payload) => received.push(payload));

    notifyBus.publish('test-topic-1', { foo: 'bar' });

    expect(received).toEqual([{ foo: 'bar' }, { foo: 'bar' }]);
  });

  test('publish is a no-op when nothing is subscribed to that topic', () => {
    expect(() => notifyBus.publish('nobody-listening', { x: 1 })).not.toThrow();
  });

  test('only handlers subscribed to the matching topic are called', () => {
    const topicA = [];
    const topicB = [];
    notifyBus.subscribe('topic-a', (p) => topicA.push(p));
    notifyBus.subscribe('topic-b', (p) => topicB.push(p));

    notifyBus.publish('topic-a', { value: 1 });

    expect(topicA).toEqual([{ value: 1 }]);
    expect(topicB).toEqual([]);
  });

  test('payload is round-tripped through JSON, matching what the Redis backend would deliver', () => {
    let received;
    notifyBus.subscribe('test-topic-2', (payload) => { received = payload; });

    const date = new Date('2026-01-01T00:00:00.000Z');
    notifyBus.publish('test-topic-2', { when: date, nested: { count: 1 } });

    // A real Date survives an in-process call unchanged, but not a JSON
    // round-trip - asserting the string form here is what proves memory
    // and Redis backends behave identically, not just "similarly."
    expect(received.when).toBe(date.toISOString());
    expect(received.nested).toEqual({ count: 1 });
  });

  test('unsubscribe (the returned function) stops further delivery to that handler', () => {
    const received = [];
    const unsubscribe = notifyBus.subscribe('test-topic-3', (payload) => received.push(payload));

    notifyBus.publish('test-topic-3', { n: 1 });
    unsubscribe();
    notifyBus.publish('test-topic-3', { n: 2 });

    expect(received).toEqual([{ n: 1 }]);
  });

  test('a handler that throws does not prevent other handlers on the same topic from running', () => {
    const received = [];
    notifyBus.subscribe('test-topic-4', () => { throw new Error('boom'); });
    notifyBus.subscribe('test-topic-4', (payload) => received.push(payload));

    expect(() => notifyBus.publish('test-topic-4', { ok: true })).not.toThrow();
    expect(received).toEqual([{ ok: true }]);
  });
});
