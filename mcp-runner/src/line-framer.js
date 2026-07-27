// Mirrors the MCP SDK's own stdio framing convention (dist/cjs/shared/stdio.js:
// newline-delimited JSON, not LSP-style Content-Length headers) so a spawned
// process's stdout is parsed exactly the way a real StdioClientTransport would
// parse it. Kept as a standalone, pure class (no spawning, no sockets) so the
// buffering/partial-line logic is unit-testable without touching a real process.
class LineFramer {
  constructor() {
    this._buffer = Buffer.alloc(0);
  }

  append(chunk) {
    this._buffer = Buffer.concat([this._buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
  }

  // Returns every complete line found so far, consuming them from the
  // buffer. Each entry is either { message } (successfully JSON.parse'd) or
  // { error, line } (malformed) - a single bad line from a misbehaving
  // spawned process shouldn't throw and take down the whole bridge.
  readMessages() {
    const results = [];
    let index;
    while ((index = this._buffer.indexOf('\n')) !== -1) {
      const line = this._buffer.toString('utf8', 0, index).replace(/\r$/, '');
      this._buffer = this._buffer.subarray(index + 1);
      if (!line.trim()) continue;
      try {
        results.push({ message: JSON.parse(line) });
      } catch (error) {
        results.push({ error, line });
      }
    }
    return results;
  }
}

module.exports = { LineFramer };
