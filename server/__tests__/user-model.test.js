const crypto = require('crypto');
const User = require('../src/models/User');

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

describe('User.validateApiKey', () => {
  test('returns true for a matching key', () => {
    const fakeUser = { apiKey: hashApiKey('mcp_abc123') };
    expect(User.prototype.validateApiKey.call(fakeUser, 'mcp_abc123')).toBe(true);
  });

  test('returns false for a non-matching key', () => {
    const fakeUser = { apiKey: hashApiKey('mcp_abc123') };
    expect(User.prototype.validateApiKey.call(fakeUser, 'mcp_wrong')).toBe(false);
  });

  test('returns false when the user has no apiKey set', () => {
    const fakeUser = { apiKey: null };
    expect(User.prototype.validateApiKey.call(fakeUser, 'mcp_abc123')).toBe(false);
  });

  test('returns false instead of throwing when stored value has an unexpected length', () => {
    const fakeUser = { apiKey: 'not-a-real-hash' };
    expect(User.prototype.validateApiKey.call(fakeUser, 'mcp_abc123')).toBe(false);
  });
});
