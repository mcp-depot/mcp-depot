#!/usr/bin/env node
// Minimal stdio fixture for ws-bridge.e2e.test.js - reads newline-delimited
// JSON from stdin, echoes each message back as a JSON-RPC-shaped response
// carrying the same id, so the test can assert a full round trip through
// the real spawn + bridge + WebSocket path (not mocked).
let buffer = '';

process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();
  let index;
  while ((index = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { echoed: msg.params } }) + '\n');
  }
});
