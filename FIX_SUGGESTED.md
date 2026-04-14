# Toolshed - Suggested Fixes

> Issues where the root cause has been diagnosed and the exact fix is documented.
> Each open entry includes: what is broken, why it is broken, and the exact code change needed.

---

## Resolved Issues

All issues below were diagnosed here and fixed by the developer. Kept as a commit reference.

| # | Issue | Fixed in |
|---|-------|---------|
| 1 | POST body template `{varName}` missing from MCP tool schema | `5cd087a`, `ea07a0e` |
| 2 | "Failed to save tool" when editing from the All Tools view | `0b7930b` |
| 3 | Tool creation fails with blank description; body params not extracted on create | `afc8af7` |
| 4 | UI: `{varName}` in body not auto-detected and synced to Default Params | `b97d1d9` |
| 5 | Two `setForm` calls in body `onChange` caused save to break | `422d1e8` |
| 6 | Unquoted `{varName}` in body caused JSON parse error; number type lost at runtime | `e96f8ea`, `f35cd8a` |
| 7 | Body template vars added twice (root key + substitution) | `45611c0` |
| 8 | Spurious `allOf` param on OpenAPI-imported tools | `20e1cd4` |
| 9 | OpenAPI importer did not generate body templates from request body schema | `377c5af` |
| 10 | OpenAPI discovery crashed on circular `$ref` (infinite recursion) | `421a482` |
| 11 | OpenAPI import marked all body params as required; ignored `required` array | `50ebd96` |
| 12 | MCP tool schema rejected by Anthropic - property key exceeded 64 chars | `4af8cae`, `07ecd17` |
| 13 | `PUT /:id` stored plaintext credentials and leaked config in response | `35d01f7` |
| 14 | Hardcoded credentials in Default Params or body templates visible to Claude | `71eac5c` |

---

## Issue 15 - OAuth token refresh is signaled but never executed

**Status:** Open

**Symptom:** OAuth tokens expire and API calls return 401. The app never automatically refreshes them even though a refresh service exists.

**Root cause - two disconnected implementations:**

`oauth.js` has a complete `getValidToken()` / `refreshToken()` implementation but `DynamicAdapter.js` never calls it. Instead `DynamicAdapter` does its own inline expiry check and returns `X-OAuth-Refresh: true` as a header signal:

```js
if (Date.now() > (expiresAt - fiveMinutes) && credentials.refreshToken) {
  return { 'Authorization': `Bearer ${accessToken}`, 'X-OAuth-Refresh': 'true' };
}
```

Nothing reads that header and triggers a refresh. The old expired token is sent to the provider API which returns 401.

**Fix - replace inline check with a call to `getValidToken`:**

In `server/src/adapters/DynamicAdapter.js`, replace the `case 'oauth2':` block:

```js
case 'oauth2': {
  const { getValidToken } = require('../services/oauth');

  const tokenResult = await getValidToken(this.auth.provider, credentials);

  let accessToken;
  if (tokenResult?.accessToken) {
    // Refreshed token - persist back to DB (see Issue 16)
    accessToken = encryption.decrypt(tokenResult.accessToken) || tokenResult.accessToken;
    await persistRefreshedToken(this.integrationId, credentials, tokenResult);
  } else {
    accessToken = encryption.decrypt(credentials.accessToken) || credentials.accessToken;
  }

  if (!accessToken) return {};
  return { 'Authorization': `Bearer ${accessToken}` };
}
```

Note: `DynamicAdapter` needs `integrationId` passed via its constructor so it can persist. Check how it is instantiated in `consume.js` and `mcp/server.js`.

---

## Issue 16 - OAuth refresh does not persist the new token

**Status:** Open (companion to Issue 15)

**Symptom:** Even if `getValidToken` is called, the refreshed token is returned in memory but never written to the database. The next request attempts another refresh. For providers that issue single-use refresh tokens (Google, Notion) the second refresh fails with 400 - permanently locking the user out.

**Root cause:**

`oauth.js` `getValidToken()` returns the encrypted token but has no DB access. The return value is currently discarded by the caller.

**Fix - persist after refresh:**

Add a helper in `DynamicAdapter.js` (or a shared util):

```js
async function persistRefreshedToken(integrationId, oldCredentials, newTokenData) {
  const { Integration } = loadModels();
  const updated = {
    ...oldCredentials,
    accessToken: newTokenData.accessToken,
    refreshToken: newTokenData.refreshToken,
    tokenData: { createdAt: newTokenData.createdAt, expiresIn: newTokenData.expiresIn }
  };
  await Integration.update(
    { config: sequelize.fn('jsonb_set', sequelize.col('config'),
        '{auth,credentials}', JSON.stringify(updated)) },
    { where: { id: integrationId } }
  );
}
```

Critical for Google and Notion which rotate refresh tokens on every use.

---

## Issue 17 - Linear OAuth `authUrl` has wrong domain

**Status:** Open

**Symptom:** Clicking "Connect with Linear" opens `https://linear/oauth/authorize` - an invalid URL. The OAuth flow never starts.

**Root cause - typo in `server/src/services/oauth.js`:**

```js
linear: {
  authUrl: 'https://linear/oauth/authorize',  // missing .app
  ...
}
```

**Fix:**

```js
linear: {
  authUrl: 'https://linear.app/oauth/authorize',
  tokenUrl: 'https://api.linear.app/oauth/token',
  scopes: ['read', 'write'],
  baseUrl: 'https://api.linear.app'
},
```

---

## Issue 18 - Jira and Notion OAuth token exchange will fail

**Status:** Open

**Two separate bugs in `server/src/services/oauth.js`:**

### Jira - wrong OAuth version endpoints

Current config uses OAuth 1.0a-style instance-relative URLs. Jira Cloud requires Atlassian OAuth 2.0 (3LO) with fixed auth URLs.

**Fix:**

```js
jira: {
  name: 'Jira',
  authUrl: 'https://auth.atlassian.com/authorize',
  tokenUrl: 'https://auth.atlassian.com/oauth/token',
  scopes: ['read:jira-work', 'write:jira-work', 'offline_access'],
  baseUrl: null,
  extraAuthParams: { audience: 'api.atlassian.com', prompt: 'consent' }
},
```

Update `buildAuthUrl()` to append `extraAuthParams` if present on the provider config. The `audience` and `prompt` params are required - without them Atlassian tokens lack the right claims and all API calls return 403.

### Notion - wrong Content-Type and missing Basic auth

Notion token endpoint requires `Authorization: Basic base64(clientId:clientSecret)` and JSON body. Current code sends all providers as URL-encoded form with no auth header.

**Fix - add provider-specific branch in `exchangeCode()`:**

```js
if (provider === 'notion') {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await axios.post(tokenUrl,
    { grant_type: 'authorization_code', code, redirect_uri: redirectUri },
    { headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json'
    }}
  );
  const data = res.data;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    createdAt: Date.now()
  };
}
```
