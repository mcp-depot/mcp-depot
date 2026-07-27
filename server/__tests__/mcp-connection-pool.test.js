process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_KEY = 'test-32-byte-encryption-key!!!!';
process.env.NODE_ENV = 'test';

// mcp-connection-pool.js exports a singleton, so every test in this file
// shares one instance - MCP_RUNNER_URL is read live (not memoized) inside
// the pool's methods specifically so tests can toggle it per-test without
// needing jest.resetModules() gymnastics.
delete process.env.MCP_RUNNER_URL;
delete process.env.MCP_RUNNER_TOKEN;

let mockConnect;

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: (...args) => mockConnect(...args),
    listTools: jest.fn().mockResolvedValue({ tools: [] }),
    callTool: jest.fn().mockResolvedValue({ content: [] })
  }))
}));

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: jest.fn().mockImplementation((opts) => ({ __type: 'stdio', opts, close: jest.fn() }))
}));

jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: jest.fn().mockImplementation((url, opts) => ({ __type: 'http', url, opts, close: jest.fn() }))
}));

jest.mock('@modelcontextprotocol/sdk/client/websocket.js', () => ({
  WebSocketClientTransport: jest.fn().mockImplementation((url) => ({ __type: 'ws', url, close: jest.fn() }))
}));

jest.mock('../src/services/mcp-runner-client');
jest.mock('../src/utils/ssrfGuard', () => ({ isUrlSafe: jest.fn().mockResolvedValue(true) }));

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { WebSocketClientTransport } = require('@modelcontextprotocol/sdk/client/websocket.js');
const mcpRunnerClient = require('../src/services/mcp-runner-client');
const pool = require('../src/services/mcp-connection-pool');

const stdioServer = {
  id: 'stdio-server-1', name: 'Stdio Server', transportType: 'stdio', sessionMode: 'stateless',
  command: 'node', args: '["/app/x.js"]', env: '{"FOO":"bar"}'
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect = jest.fn().mockResolvedValue(undefined);
  delete process.env.MCP_RUNNER_URL;
  delete process.env.MCP_RUNNER_TOKEN;
});

describe('MCP_RUNNER_URL unset - stdio behaves exactly as before (backward compat)', () => {
  test('a stateless stdio listTools call uses StdioClientTransport directly, never touches mcp-runner-client', async () => {
    await pool.listTools(stdioServer);

    expect(StdioClientTransport).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'node', args: ['/app/x.js'] })
    );
    expect(WebSocketClientTransport).not.toHaveBeenCalled();
    expect(mcpRunnerClient.registerServer).not.toHaveBeenCalled();
    expect(mcpRunnerClient.ensureWebSocketGlobal).not.toHaveBeenCalled();
  });

  test('the local StdioClientTransport env still merges process.env with the server\'s configured env', async () => {
    await pool.listTools(stdioServer);
    const call = StdioClientTransport.mock.calls[0][0];
    expect(call.env.FOO).toBe('bar');
    expect(call.env.PATH).toBe(process.env.PATH);
  });
});

describe('MCP_RUNNER_URL set - stdio routes through the sidecar via WebSocketClientTransport', () => {
  beforeEach(() => {
    process.env.MCP_RUNNER_URL = 'http://mcp-runner:9500';
    mcpRunnerClient.isEnabled.mockReturnValue(true);
    mcpRunnerClient.buildWsUrl.mockImplementation((id) => new URL(`ws://mcp-runner:9500/spawn/${id}`));
    mcpRunnerClient.registerServer.mockResolvedValue({ ok: true });
  });

  test('a clean first-attempt connect never calls registerServer', async () => {
    await pool.listTools(stdioServer);

    expect(WebSocketClientTransport).toHaveBeenCalledTimes(1);
    expect(WebSocketClientTransport).toHaveBeenCalledWith(expect.any(URL));
    expect(StdioClientTransport).not.toHaveBeenCalled();
    expect(mcpRunnerClient.registerServer).not.toHaveBeenCalled();
    expect(mcpRunnerClient.ensureWebSocketGlobal).toHaveBeenCalled();
  });

  test('a failed first attempt re-registers and retries once, succeeding on the retry', async () => {
    mockConnect.mockRejectedValueOnce(new Error('connect:x timed out after 10000ms'));
    mockConnect.mockResolvedValueOnce(undefined);

    const result = await pool.listTools(stdioServer);

    expect(result).toEqual([]);
    expect(mcpRunnerClient.registerServer).toHaveBeenCalledWith({
      serverId: 'stdio-server-1', command: 'node', args: ['/app/x.js'], env: { FOO: 'bar' }
    });
    expect(WebSocketClientTransport).toHaveBeenCalledTimes(2);
    expect(Client).toHaveBeenCalledTimes(2); // fresh client/transport pair on retry, not reused
  });

  test('when both attempts fail, the error propagates clearly instead of hanging or swallowing it', async () => {
    mockConnect.mockRejectedValueOnce(new Error('first failure'));
    mockConnect.mockRejectedValueOnce(new Error('second failure'));

    await expect(pool.listTools(stdioServer)).rejects.toThrow(/second failure/);
    expect(mcpRunnerClient.registerServer).toHaveBeenCalledTimes(1);
  });

  test('if registerServer itself throws during the retry, that error propagates too', async () => {
    mockConnect.mockRejectedValueOnce(new Error('first failure'));
    mcpRunnerClient.registerServer.mockRejectedValueOnce(new Error('mcp-runner unreachable'));

    await expect(pool.listTools(stdioServer)).rejects.toThrow(/mcp-runner unreachable/);
    expect(WebSocketClientTransport).toHaveBeenCalledTimes(1); // never got to the retry's transport
  });

  test('http/sse servers are completely unaffected by MCP_RUNNER_URL being set', async () => {
    const httpServer = {
      id: 'http-server-1', name: 'HTTP Server', transportType: 'http', sessionMode: 'stateless',
      url: 'https://example.com/mcp', config: {}
    };
    await pool.listTools(httpServer);

    expect(WebSocketClientTransport).not.toHaveBeenCalled();
    expect(mcpRunnerClient.registerServer).not.toHaveBeenCalled();
  });
});
