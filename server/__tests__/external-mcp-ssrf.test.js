process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';

// Real connection pool this time - no mock - to prove the SSRF re-check
// added to _createClient actually runs before a connection is attempted.
const pool = require('../src/services/mcp-connection-pool');

describe('mcp-connection-pool - re-validates the URL at connect time, not just at save time', () => {
  test('rejects a server whose URL points at a blocked hostname', async () => {
    const server = {
      id: 'test-server-1', name: 'Sneaky Internal Server', transportType: 'http',
      url: 'http://localhost:9999/mcp', authType: 'none', sessionMode: 'stateless'
    };

    await expect(pool.listTools(server)).rejects.toThrow(/blocked or unresolvable internal address/i);
  });

  test('rejects a server whose URL resolves to a private IP literal', async () => {
    const server = {
      id: 'test-server-2', name: 'Private IP Server', transportType: 'http',
      url: 'http://169.254.169.254/latest/meta-data/', authType: 'none', sessionMode: 'stateless'
    };

    await expect(pool.listTools(server)).rejects.toThrow(/blocked or unresolvable internal address/i);
  });
});
