jest.mock('axios');

const axios = require('axios');
const OpenAPIParser = require('../src/services/openapi-parser');

const PETSTORE_SPEC = {
  openapi: '3.0.4',
  info: { title: 'Swagger Petstore - OpenAPI 3.0', version: '1.0.0' },
  servers: [{ url: '/api/v3' }],
  paths: {
    '/pet': {
      get: { operationId: 'getPet', summary: 'Find pet' }
    }
  }
};

describe('OpenAPIParser.joinBaseAndPath', () => {
  test('appends a leading-slash spec path onto a host-only base URL', () => {
    expect(OpenAPIParser.joinBaseAndPath(
      'https://petstore3.swagger.io',
      '/api/v3/openapi.yaml'
    )).toBe('https://petstore3.swagger.io/api/v3/openapi.yaml');
  });

  test('appends a spec path onto a base URL that already has a path prefix', () => {
    // Regression: WHATWG URL('/v3/openapi.yaml', 'https://host/api') drops /api
    expect(OpenAPIParser.joinBaseAndPath(
      'https://petstore3.swagger.io/api',
      '/v3/openapi.yaml'
    )).toBe('https://petstore3.swagger.io/api/v3/openapi.yaml');
  });

  test('does not double slashes when the base URL has a trailing slash', () => {
    expect(OpenAPIParser.joinBaseAndPath(
      'https://petstore3.swagger.io/api/',
      '/v3/openapi.yaml'
    )).toBe('https://petstore3.swagger.io/api/v3/openapi.yaml');
  });

  test('leaves an absolute spec URL unchanged', () => {
    expect(OpenAPIParser.joinBaseAndPath(
      'https://example.com/api',
      'https://docs.example.com/openapi.yaml'
    )).toBe('https://docs.example.com/openapi.yaml');
  });
});

describe('OpenAPIParser.resolveServerUrl', () => {
  test('resolves a root-relative servers.url against the spec document URL', () => {
    expect(OpenAPIParser.resolveServerUrl(
      '/api/v3',
      'https://petstore3.swagger.io/api/v3/openapi.yaml',
      'https://petstore3.swagger.io'
    )).toBe('https://petstore3.swagger.io/api/v3');
  });

  test('uses an absolute servers.url as-is', () => {
    expect(OpenAPIParser.resolveServerUrl(
      'https://petstore3.swagger.io/api/v3',
      'https://petstore3.swagger.io/api/v3/openapi.yaml',
      'https://petstore3.swagger.io'
    )).toBe('https://petstore3.swagger.io/api/v3');
  });

  test('falls back to the provided base URL when servers.url is missing', () => {
    expect(OpenAPIParser.resolveServerUrl(
      undefined,
      'https://petstore3.swagger.io/api/v3/openapi.yaml',
      'https://petstore3.swagger.io'
    )).toBe('https://petstore3.swagger.io');
  });
});

describe('OpenAPIParser.parseSpec', () => {
  test('uses the spec servers URL as the integration base URL', () => {
    const parser = new OpenAPIParser('https://petstore3.swagger.io');
    parser.specUrl = 'https://petstore3.swagger.io/api/v3/openapi.yaml';
    const result = parser.parseSpec(PETSTORE_SPEC);
    expect(result.baseUrl).toBe('https://petstore3.swagger.io/api/v3');
    expect(result.info.title).toBe('Swagger Petstore - OpenAPI 3.0');
    expect(result.endpoints).toEqual([
      expect.objectContaining({ path: '/pet', method: 'GET', operationId: 'getPet' })
    ]);
  });

  test('rejects HTML that is not an OpenAPI document', () => {
    const parser = new OpenAPIParser('https://petstore3.swagger.io');
    expect(() => parser.parseSpec('<!DOCTYPE html><html><body>Swagger UI</body></html>'))
      .toThrow(/not a valid OpenAPI/);
  });
});

describe('OpenAPIParser.discover', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  test('fetches the spec from base URL + path when the base already has a prefix', async () => {
    axios.get.mockResolvedValue({
      data: PETSTORE_SPEC,
      headers: { 'content-type': 'application/json' }
    });

    const parser = new OpenAPIParser('https://petstore3.swagger.io/api');
    const result = await parser.discover('/v3/openapi.yaml');

    expect(axios.get).toHaveBeenCalledWith(
      'https://petstore3.swagger.io/api/v3/openapi.yaml',
      expect.any(Object)
    );
    expect(result.baseUrl).toBe('https://petstore3.swagger.io/api/v3');
    expect(result.total).toBe(1);
  });

  test('fetches the spec from a host-only base URL plus an absolute spec path', async () => {
    axios.get.mockResolvedValue({
      data: PETSTORE_SPEC,
      headers: { 'content-type': 'application/yaml' }
    });

    const parser = new OpenAPIParser('https://petstore3.swagger.io');
    const result = await parser.discover('/api/v3/openapi.yaml');

    expect(axios.get).toHaveBeenCalledWith(
      'https://petstore3.swagger.io/api/v3/openapi.yaml',
      expect.any(Object)
    );
    expect(result.baseUrl).toBe('https://petstore3.swagger.io/api/v3');
  });

  test('rejects an HTML response instead of treating it as a spec', async () => {
    axios.get.mockResolvedValue({
      data: '<html>not a spec</html>',
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });

    const parser = new OpenAPIParser('https://petstore3.swagger.io/api');
    await expect(parser.discover('/v3/openapi.yaml')).rejects.toThrow(/HTML instead of an OpenAPI spec/);
  });
});
