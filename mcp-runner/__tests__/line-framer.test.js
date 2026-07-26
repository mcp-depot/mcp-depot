const { LineFramer } = require('../src/line-framer');

describe('LineFramer', () => {
  test('parses a single complete line', () => {
    const framer = new LineFramer();
    framer.append('{"jsonrpc":"2.0","id":1,"result":{}}\n');
    const messages = framer.readMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
  });

  test('buffers a partial line across multiple appends', () => {
    const framer = new LineFramer();
    framer.append('{"jsonrpc":"2.0",');
    expect(framer.readMessages()).toHaveLength(0);
    framer.append('"id":1,"result":{}}\n');
    const messages = framer.readMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].message.id).toBe(1);
  });

  test('parses multiple lines delivered in one chunk', () => {
    const framer = new LineFramer();
    framer.append('{"id":1}\n{"id":2}\n{"id":3}\n');
    const messages = framer.readMessages();
    expect(messages.map(m => m.message.id)).toEqual([1, 2, 3]);
  });

  test('strips trailing \\r (CRLF line endings)', () => {
    const framer = new LineFramer();
    framer.append('{"id":1}\r\n');
    const messages = framer.readMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].message.id).toBe(1);
  });

  test('skips blank lines without producing an entry', () => {
    const framer = new LineFramer();
    framer.append('\n\n{"id":1}\n');
    const messages = framer.readMessages();
    expect(messages).toHaveLength(1);
  });

  test('a malformed line produces an error entry, not a thrown exception, and does not block subsequent valid lines', () => {
    const framer = new LineFramer();
    framer.append('not json\n{"id":1}\n');
    const messages = framer.readMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].error).toBeInstanceOf(Error);
    expect(messages[0].line).toBe('not json');
    expect(messages[1].message.id).toBe(1);
  });

  test('leaves an incomplete trailing line in the buffer for the next append', () => {
    const framer = new LineFramer();
    framer.append('{"id":1}\n{"id":2}');
    const messages = framer.readMessages();
    expect(messages).toHaveLength(1);
    framer.append('\n');
    expect(framer.readMessages()).toHaveLength(1);
  });
});
