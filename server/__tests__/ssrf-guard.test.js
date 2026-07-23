jest.mock('dns', () => ({
  promises: { lookup: jest.fn() }
}));

const dns = require('dns');
const { isUrlSafe, isPrivateIp } = require('../src/utils/ssrfGuard');

describe('SSRF guard', () => {
  beforeEach(() => {
    dns.promises.lookup.mockReset();
  });

  describe('isUrlSafe - literal IPs (no DNS lookup needed)', () => {
    test.each([
      ['http://127.0.0.1/', 'loopback'],
      ['http://169.254.169.254/latest/meta-data/', 'cloud metadata / link-local'],
      ['http://10.0.0.5/', 'private 10.0.0.0/8'],
      ['http://172.16.0.1/', 'private 172.16.0.0/12'],
      ['http://192.168.1.1/', 'private 192.168.0.0/16'],
      ['http://0.0.0.0/', 'unspecified'],
      ['http://[::1]/', 'IPv6 loopback'],
      ['http://[fe80::1]/', 'IPv6 link-local'],
      ['http://[fd00::1]/', 'IPv6 unique-local']
    ])('blocks %s (%s)', async (url) => {
      expect(await isUrlSafe(url)).toBe(false);
      expect(dns.promises.lookup).not.toHaveBeenCalled();
    });

    test('allows a public literal IP', async () => {
      expect(await isUrlSafe('http://8.8.8.8/')).toBe(true);
      expect(dns.promises.lookup).not.toHaveBeenCalled();
    });
  });

  describe('isUrlSafe - protocol and format validation', () => {
    test('rejects non-http(s) protocols', async () => {
      expect(await isUrlSafe('ftp://example.com/')).toBe(false);
      expect(await isUrlSafe('file:///etc/passwd')).toBe(false);
    });

    test('rejects unparseable input', async () => {
      expect(await isUrlSafe('not a url')).toBe(false);
    });

    test('blocks the literal "localhost" hostname without a DNS lookup', async () => {
      expect(await isUrlSafe('http://localhost:8080/')).toBe(false);
      expect(dns.promises.lookup).not.toHaveBeenCalled();
    });
  });

  describe('isUrlSafe - hostname resolution (mocked DNS)', () => {
    test('allows a hostname that resolves to a public address', async () => {
      dns.promises.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
      expect(await isUrlSafe('http://example.com/')).toBe(true);
    });

    test('blocks a hostname that resolves to a private address (DNS rebinding)', async () => {
      dns.promises.lookup.mockResolvedValue([{ address: '10.1.2.3', family: 4 }]);
      expect(await isUrlSafe('http://evil.example.com/')).toBe(false);
    });

    test('blocks when ANY resolved address is private, even if others are public', async () => {
      dns.promises.lookup.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 }
      ]);
      expect(await isUrlSafe('http://multi-homed.example.com/')).toBe(false);
    });

    test('fails closed when DNS resolution throws', async () => {
      dns.promises.lookup.mockRejectedValue(new Error('ENOTFOUND'));
      expect(await isUrlSafe('http://nonexistent.invalid/')).toBe(false);
    });

    test('fails closed when DNS resolves to no addresses at all', async () => {
      dns.promises.lookup.mockResolvedValue([]);
      expect(await isUrlSafe('http://no-records.example.com/')).toBe(false);
    });
  });

  describe('isPrivateIp', () => {
    test.each([
      ['127.0.0.1', true],
      ['10.255.255.255', true],
      ['172.31.0.1', true],
      ['172.32.0.1', false], // just outside the 172.16.0.0/12 range
      ['192.168.0.1', true],
      ['169.254.169.254', true],
      ['8.8.8.8', false],
      ['1.1.1.1', false]
    ])('isPrivateIp(%s) === %s', (ip, expected) => {
      expect(isPrivateIp(ip)).toBe(expected);
    });
  });
});
