const serverRegistry = require('../src/server-registry');

describe('server-registry', () => {
  afterEach(() => {
    serverRegistry.unregister('srv-1');
    serverRegistry.unregister('srv-2');
  });

  test('register then get returns the stored config', () => {
    serverRegistry.register('srv-1', { command: 'node', args: ['x.js'], env: {} });
    expect(serverRegistry.get('srv-1')).toEqual({ command: 'node', args: ['x.js'], env: {} });
  });

  test('get on an unregistered id returns undefined', () => {
    expect(serverRegistry.get('never-registered')).toBeUndefined();
  });

  test('unregister removes it', () => {
    serverRegistry.register('srv-1', { command: 'node', args: [], env: {} });
    serverRegistry.unregister('srv-1');
    expect(serverRegistry.get('srv-1')).toBeUndefined();
  });

  test('re-registering the same id overwrites the previous config', () => {
    serverRegistry.register('srv-1', { command: 'node', args: ['old.js'], env: {} });
    serverRegistry.register('srv-1', { command: 'node', args: ['new.js'], env: {} });
    expect(serverRegistry.get('srv-1').args).toEqual(['new.js']);
  });

  test('size reflects the number of registered servers', () => {
    const before = serverRegistry.size();
    serverRegistry.register('srv-1', { command: 'node', args: [], env: {} });
    serverRegistry.register('srv-2', { command: 'node', args: [], env: {} });
    expect(serverRegistry.size()).toBe(before + 2);
  });
});
