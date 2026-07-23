const { slugify, computeExposedName } = require('../src/utils/slugify');

describe('slugify', () => {
  test('lowercases and replaces non-alphanumeric characters with underscores', () => {
    expect(slugify('Finshape Jira')).toBe('finshape_jira');
  });

  test('collapses repeated underscores and trims leading/trailing underscores', () => {
    expect(slugify('  My!!Integration**  ')).toBe('my_integration');
  });

  test('preserves hyphens as valid slug characters (not collapsed to underscore)', () => {
    expect(slugify('my-integration')).toBe('my-integration');
  });

  test('truncates to the given max length', () => {
    expect(slugify('a'.repeat(50), 10).length).toBeLessThanOrEqual(10);
  });

  test('falls back to a single underscore for an all-symbol input', () => {
    expect(slugify('!!!')).toBe('_');
  });
});

describe('computeExposedName', () => {
  // This is the exact mechanism that prevents two different integrations
  // from registering a tool with the same exposed name - a regression here
  // reintroduces the exposedName collision bug found in meta-tools.js.
  test('namespaces the tool name under the integration slug', () => {
    expect(computeExposedName('jira', 'list')).toBe('jira_list');
  });

  test('two integrations with the same tool name produce distinct exposedNames', () => {
    const a = computeExposedName('finshape_jira', 'list');
    const b = computeExposedName('finshape_bitbucket', 'list');
    expect(a).not.toBe(b);
  });

  test('result never exceeds maxTotal (64 by default)', () => {
    const name = computeExposedName('a-very-long-integration-slug-name', 'a-very-long-tool-name-as-well');
    expect(name.length).toBeLessThanOrEqual(64);
  });

  test('sanitizes special characters out of the tool name portion', () => {
    const name = computeExposedName('jira', 'Get a pull request!');
    expect(name).toBe('jira_Get_a_pull_request');
  });

  test('produces an empty tool-name portion gracefully when the whole budget is consumed by a long slug', () => {
    const longSlug = 'x'.repeat(32);
    const name = computeExposedName(longSlug, 'anything', 33);
    expect(name).toBe(longSlug.slice(0, 32) + '_');
  });
});
