# MCP Depot - Development Guide

This document defines the shared patterns, helpers, and conventions for both the server and client. Its purpose is to prevent duplication and inconsistency. Before writing any route handler, loading state, ownership check, modal, or error handler - check here first.

> **Rule of thumb:** if you are about to write something that looks like it could appear in another file, it probably already exists here. Use the existing piece; do not copy-paste and modify.

---

## Table of Contents

### Backend
1. [Middleware](#middleware)
   - [Auth middleware on every protected route](#auth-middleware-on-every-protected-route)
   - [Role checks](#role-checks)
2. [Data Isolation](#data-isolation)
   - [ownerWhere](#ownerwhere)
   - [readableWhere](#readablewhere)
   - [visibility field convention](#visibility-field-convention)
3. [Route Helpers](#route-helpers)
   - [refreshMcpTools](#refreshmcptools)
4. [Express Conventions](#express-conventions)
   - [Response shape](#response-shape)
   - [Async error handling](#async-error-handling)
   - [Route ordering](#route-ordering)
5. [Caches](#caches)
6. [Backend Anti-Patterns](#backend-anti-patterns)
7. [Backend PR Checklist](#backend-pr-checklist)

### Frontend
8. [Hooks](#hooks)
   - [useFetch](#usefetch)
   - [useFormModal](#useformmodal)
   - [useDeleteConfirm](#usedeleteconfirm)
9. [Components](#components)
   - [Modal](#modal)
   - [EmptyState](#emptystate)
   - [StatusBadge](#statusbadge)
   - [TagInput](#taginput)
   - [AuthFieldsGroup](#authfieldsgroup)
10. [Utilities](#utilities)
    - [getApiError](#getapierror)
    - [formatDate / formatDateTime](#formatdate--formatdatetime)
11. [Frontend Anti-Patterns](#frontend-anti-patterns)
12. [Frontend PR Checklist](#frontend-pr-checklist)

---

---

# Backend

---

## Middleware

### Auth middleware on every protected route

**File:** `src/middleware/auth.js`

The `auth` middleware validates the JWT (or API key) and sets `req.user` to the full User record. It exposes `req.user.id` and `req.user.role` to every handler after it.

**Always apply `auth` as route middleware on any endpoint that requires a logged-in user.** Never extract or verify the JWT manually inside a handler.

```js
const { auth } = require('../middleware/auth');

// ✅ Correct - middleware handles auth, handler just uses req.user
router.get('/my-items', auth, async (req, res) => {
  const items = await Item.findAll({ where: { userId: req.user.id } });
  res.json(items);
});

router.put('/my-items/:id', auth, async (req, res) => {
  // req.user is already verified and populated
  const item = await Item.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!item) return res.status(404).json({ error: 'Not found' });
  await item.update(req.body);
  res.json(item);
});
```

**WRONG - do not do this:**

```js
// ❌ Manual JWT extraction in every handler
router.get('/my-items', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const items = await Item.findAll({ where: { userId } });
  res.json(items);
});
```

---

### Role checks

After `auth`, check `req.user.role` to gate admin-only routes. Use a dedicated `adminOnly` middleware for routes that should never be reachable by regular users. For routes where admins and users see different data, check inline.

```js
// Middleware for hard admin-only routes
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ✅ Hard gate - non-admins cannot reach handler at all
router.delete('/users/:id', auth, adminOnly, async (req, res) => { ... });

// ✅ Soft gate - admins see all, users see their own
router.get('/items', auth, async (req, res) => {
  const where = req.user.role === 'admin' ? {} : { userId: req.user.id };
  const items = await Item.findAll({ where });
  res.json(items);
});
```

**WRONG - do not do this:**

```js
// ❌ Role check inline in every handler with no consistency
router.delete('/users/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  // ... sometimes the message is different, sometimes it's 401, etc.
});
```

---

## Data Isolation

Every entity that belongs to a user must be filtered correctly on every read endpoint. The rules are:

| Entity type | Who can read |
|-------------|--------------|
| Owned (private by default) | Owner only; admins see all |
| Shared | Owner + everyone; admins see all |
| Global (no owner) | Everyone; admins see all |

---

### ownerWhere

A helper that builds the Sequelize `where` clause for owned entities. Admins bypass the filter; regular users see only their own records.

**File:** `src/utils/queryHelpers.js`

```js
/**
 * Returns a where-clause fragment that restricts results to the given user's records.
 * Admins receive an empty object (no restriction).
 */
function ownerWhere(userId, userRole) {
  if (userRole === 'admin') return {};
  return { userId };
}

module.exports = { ownerWhere };
```

Usage:

```js
const { ownerWhere } = require('../utils/queryHelpers');

router.get('/integrations', auth, async (req, res) => {
  const items = await Integration.findAll({
    where: ownerWhere(req.user.id, req.user.role),
  });
  res.json(items);
});
```

**WRONG - do not do this:**

```js
// ❌ Inline where-clause repeated in every list endpoint
router.get('/integrations', auth, async (req, res) => {
  const where = req.user.role === 'admin' ? {} : { userId: req.user.id };
  // same block repeated 5+ times across the codebase
});
```

---

### readableWhere

A helper for entities that support shared visibility. Returns records that are either owned by the user, explicitly shared, or (for admins) everything.

**File:** `src/utils/queryHelpers.js`

```js
const { Op } = require('sequelize');

/**
 * Returns a where-clause for "readable" items:
 * - Admins: all records (including those with no owner)
 * - Users: their own records + shared records (never null-owner records)
 */
function readableWhere(userId, userRole) {
  if (userRole === 'admin') return {};
  return {
    [Op.or]: [
      { createdBy: userId },
      { isShared: true },
    ],
  };
}

module.exports = { ownerWhere, readableWhere };
```

Usage:

```js
const { readableWhere } = require('../utils/queryHelpers');

router.get('/session-contexts', auth, async (req, res) => {
  const contexts = await SessionContext.findAll({
    where: readableWhere(req.user.id, req.user.role),
  });
  res.json(contexts);
});
```

> **Important:** never include `{ createdBy: null }` in the `Op.or` array for non-admins. Null-owner records are system records (seeded on startup) - they should be visible to everyone only when the entity's design explicitly requires it. In that case, use `readableWhere` with an `includeSystem: true` option and document the reason.

**WRONG - do not do this:**

```js
// ❌ Null-owner records leaked to all users
const where = {
  [Op.or]: [
    { createdBy: userId },
    { isShared: true },
    { createdBy: null },  // ← leaks system/admin records to all users
  ],
};
```

---

### visibility field convention

Entities that can be shared use a `visibility` string field with two values:

| Value | Meaning |
|-------|---------|
| `'private'` | Visible to owner and admins only (default) |
| `'shared'` | Visible to all logged-in users |

When seeding built-in / system-level records (e.g. in `database.js` on startup), always set `visibility: 'shared'` explicitly. If you omit it, the default `'private'` means regular users cannot see them.

```js
// ✅ Built-in integration seeded as shared
await Integration.findOrCreate({
  where: { name: 'MCP Depot' },
  defaults: {
    userId: adminUser.id,
    visibility: 'shared',   // ← required: all users must see this
    // ...
  },
});
```

---

## Route Helpers

### refreshMcpTools

After any change to an integration's tool list (create, update, delete, test), the MCP tool cache must be invalidated so the next `GET /tools` call reflects the change.

**Extract this as a single helper function, not inline code.** It is currently repeated 24 times across `integrations.js`.

**File:** `src/utils/mcpHelpers.js`

```js
/**
 * Invalidates the tool cache and triggers a refresh for the given integration.
 * Call this after any mutation that changes an integration's available tools.
 */
async function refreshMcpTools(integrationId) {
  try {
    toolCache.delete(integrationId);
    await loadToolsForIntegration(integrationId);
  } catch (err) {
    // Non-fatal: log but don't fail the request
    console.error(`Tool refresh failed for integration ${integrationId}:`, err.message);
  }
}

module.exports = { refreshMcpTools };
```

Usage:

```js
const { refreshMcpTools } = require('../utils/mcpHelpers');

router.post('/integrations', auth, async (req, res) => {
  const integration = await Integration.create({ ...req.body, userId: req.user.id });
  await refreshMcpTools(integration.id);   // ← one line, not 5 lines
  res.status(201).json(integration);
});
```

**WRONG - do not do this:**

```js
// ❌ Inline cache invalidation repeated 24 times
try {
  toolCache.delete(integration.id);
  await loadToolsForIntegration(integration.id);
} catch (err) {
  console.error('Failed to refresh tools:', err);
}
```

---

## Express Conventions

### Response shape

All routes must return consistent JSON shapes:

| Situation | Shape | Status |
|-----------|-------|--------|
| Success (single item) | `{ ...itemFields }` or `{ item: { ... } }` | 200 / 201 |
| Success (list) | `[ ...items ]` or `{ items: [...], total: N }` | 200 |
| Not found | `{ error: 'Not found' }` | 404 |
| Unauthorized | `{ error: 'Unauthorized' }` | 401 |
| Forbidden | `{ error: 'Forbidden' }` | 403 |
| Validation error | `{ error: 'descriptive message' }` | 400 |
| Server error | `{ error: 'Internal server error' }` | 500 |

Always use `error` as the key for error messages. Never mix `message`, `msg`, `detail`, etc.

---

### Async error handling

Every route handler that uses `await` must be wrapped in try/catch. Never let an unhandled promise rejection crash the process.

```js
// ✅ Correct
router.get('/items', auth, async (req, res) => {
  try {
    const items = await Item.findAll({ where: ownerWhere(req.user.id, req.user.role) });
    res.json(items);
  } catch (err) {
    console.error('GET /items error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**WRONG - do not do this:**

```js
// ❌ No try/catch - one DB error crashes the whole request
router.get('/items', auth, async (req, res) => {
  const items = await Item.findAll();
  res.json(items);
});
```

---

### Route ordering

Express matches routes in declaration order and stops at the first match. Two routes with the same method + path is a bug: the second one is dead code and will never execute.

**Rules:**
- Declare specific paths before parameterised paths: `/items/export` before `/items/:id`
- Never declare the same method + path twice in the same router file
- Before adding a new route, `Ctrl+F` the method + path string in the file to confirm it does not already exist

```js
// ✅ Specific before parameterised
router.get('/integrations/composite', auth, handleComposite);   // matches /composite
router.get('/integrations/:id',       auth, handleGetOne);      // matches anything else

// ❌ Dead code - second route never reached
router.post('/composite/:id/test', auth, handlerA);
// ... 100 lines later ...
router.post('/composite/:id/test', auth, handlerB);  // ← never executes
```

---

## Caches

When caching data that is user-specific (tool lists, session data), use a `Map` keyed by `userId`. Never use a single shared object or variable as a cache when different users may have different data.

```js
// ✅ Per-user cache
const toolsCache = new Map();  // key: userId, value: { tools, cachedAt }

function getCachedTools(userId) {
  const entry = toolsCache.get(userId);
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL) return entry.tools;
  return null;
}

function setCachedTools(userId, tools) {
  toolsCache.set(userId, { tools, cachedAt: Date.now() });
}

function invalidateToolsCache(userId) {
  toolsCache.delete(userId);
}
```

**WRONG - do not do this:**

```js
// ❌ Single shared cache - user A's tool list served to user B
let cachedTools = null;
let cacheTime = null;

if (cachedTools && Date.now() - cacheTime < CACHE_TTL) {
  return res.json(cachedTools);  // returns admin tools to a regular user
}
```

---

## Backend Anti-Patterns

These are banned. If you see them in a PR, they must be fixed before merge.

### Inline JWT extraction

Any handler that manually calls `jwt.verify()` or reads `req.headers.authorization` must use the `auth` middleware instead.

### Missing user filter on GET list endpoints

Any `findAll()` or equivalent with no `where` clause on a user-owned entity is a data leak. Always apply `ownerWhere` or `readableWhere`.

### Missing ownership check on PUT / DELETE

Before updating or deleting a record, always verify the record belongs to the requesting user (or the user is an admin). A bare `findByPk(id)` with no user check is a broken access control vulnerability.

```js
// ❌ No ownership check
router.delete('/items/:id', auth, async (req, res) => {
  const item = await Item.findByPk(req.params.id);
  await item.destroy();
  res.json({ success: true });
});

// ✅ Ownership verified
router.delete('/items/:id', auth, async (req, res) => {
  const where = req.user.role === 'admin'
    ? { id: req.params.id }
    : { id: req.params.id, userId: req.user.id };
  const item = await Item.findOne({ where });
  if (!item) return res.status(404).json({ error: 'Not found' });
  await item.destroy();
  res.json({ success: true });
});
```

### Shared cache across users

Any cache storing user-specific data that is not keyed by `userId` is a data leak. See [Caches](#caches).

### Duplicate route blocks

Copy-pasting an entire block of routes (even with minor changes) creates dead code. Extract the shared logic into a helper and call it from a single route. See [Route ordering](#route-ordering).

### `{ createdBy: null }` in non-admin readable queries

This leaks system-seeded records to all users. Use `readableWhere` which handles this correctly. See [readableWhere](#readablewhere).

### Inline `refreshMcpTools` logic

See [refreshMcpTools](#refreshmcptools). Any inline cache-delete + reload block must use the helper.

---

## Backend PR Checklist

Before opening a pull request for any server-side change, verify every item.

**Authentication and authorisation**
- [ ] Every new route that requires login uses the `auth` middleware - no inline JWT extraction
- [ ] Admin-only routes use `adminOnly` middleware or an equivalent role check
- [ ] PUT and DELETE handlers verify ownership before mutating (or confirm the user is admin)

**Data isolation**
- [ ] List endpoints (`findAll`) use `ownerWhere` or `readableWhere` - no bare `findAll()` on user-owned entities
- [ ] System/built-in records seeded at startup have `visibility: 'shared'` set explicitly
- [ ] `readableWhere` does not include `{ createdBy: null }` for non-admin users

**Helpers and DRY**
- [ ] Tool cache invalidation uses `refreshMcpTools` helper - no inline cache-delete + reload blocks
- [ ] Ownership filter uses `ownerWhere` helper - no inline `role === 'admin' ? {} : { userId }` blocks
- [ ] No method + path combination appears more than once in the router file

**Error handling and responses**
- [ ] Every `await` call is inside a try/catch
- [ ] Error responses use `{ error: '...' }` (not `message`, `msg`, or `detail`)
- [ ] Correct HTTP status codes: 401 Unauthorized, 403 Forbidden, 404 Not Found, 400 Bad Request

**Caches**
- [ ] Any new cache for user-specific data is keyed by `userId` (not a shared variable)

---

---

# Frontend

---

## Hooks

Hooks live in `src/hooks/`. Import from there — never re-implement the same logic inline.

---

### useFetch

**File:** `src/hooks/useFetch.js`

Handles data fetching with loading, error, and refetch. Use this any time a component needs to load a list or single item from the API on mount.

```jsx
import { useFetch } from '../hooks/useFetch';

function MyPage() {
  const { data: items, loading, error, refetch } = useFetch('/my-endpoint');

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <>
      {items.map(item => <div key={item.id}>{item.name}</div>)}
      <button onClick={refetch}>Reload</button>
    </>
  );
}
```

**Options:**

| Param | Type | Description |
|-------|------|-------------|
| `url` | string | API path, e.g. `'/integrations'` |
| `deps` | array | Extra dependencies that trigger a re-fetch when they change (optional) |

**Returns:** `{ data, loading, error, refetch }`

**WRONG - do not do this:**

```jsx
// ❌ Manual loading state in every component
const [items, setItems] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  const fetch = async () => {
    try {
      setLoading(true);
      const res = await api.get('/my-endpoint');
      setItems(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  fetch();
}, []);
```

---

### useFormModal

**File:** `src/hooks/useFormModal.js`

Manages open/close state, create vs edit mode, and form data for any modal that creates or edits an item.

```jsx
import { useFormModal } from '../hooks/useFormModal';

const DEFAULTS = { name: '', description: '' };

function MyPage() {
  const { open, editItem, formData, setFormData, saving, setSaving, openCreate, openEdit, close } =
    useFormModal(DEFAULTS);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editItem) {
        await api.put(`/items/${editItem.id}`, formData);
      } else {
        await api.post('/items', formData);
      }
      close();
      refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button onClick={openCreate}>New item</button>
      {items.map(item => (
        <button key={item.id} onClick={() => openEdit(item)}>Edit</button>
      ))}

      {open && (
        <Modal title={editItem ? 'Edit item' : 'New item'} onClose={close}>
          <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </Modal>
      )}
    </>
  );
}
```

**Returns:** `{ open, editItem, formData, setFormData, saving, setSaving, openCreate, openEdit, close }`

**WRONG - do not do this:**

```jsx
// ❌ Inline modal state repeated in every page
const [showModal, setShowModal] = useState(false);
const [editItem, setEditItem] = useState(null);
const [formData, setFormData] = useState({ name: '' });

const openEdit = (item) => {
  setEditItem(item);
  setFormData(item);
  setShowModal(true);
};
const closeModal = () => {
  setShowModal(false);
  setEditItem(null);
};
```

---

### useDeleteConfirm

**File:** `src/hooks/useDeleteConfirm.js`

Handles the "select item to delete → confirm → call API → update list" flow.

```jsx
import { useDeleteConfirm } from '../hooks/useDeleteConfirm';

function MyPage() {
  const [items, setItems] = useState([]);

  const { deleteId, confirmDelete, cancel, doDelete } = useDeleteConfirm(
    '/items',
    (deletedId) => setItems(prev => prev.filter(i => i.id !== deletedId))
  );

  return (
    <>
      {items.map(item => (
        <button key={item.id} onClick={() => confirmDelete(item.id)}>Delete</button>
      ))}

      {deleteId && (
        <Modal title="Confirm delete" onClose={cancel}>
          <p>Are you sure you want to delete this item?</p>
          <button onClick={cancel}>Cancel</button>
          <button onClick={doDelete}>Delete</button>
        </Modal>
      )}
    </>
  );
}
```

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `endpoint` | string | Base API path, e.g. `'/items'`. Delete calls `DELETE /items/:id` |
| `onDeleted` | `(id) => void` | Called after successful delete — use to remove item from local state |

**Returns:** `{ deleteId, confirmDelete, cancel, doDelete }`

**WRONG - do not do this:**

```jsx
// ❌ Manual delete state in every page
const [deleteId, setDeleteId] = useState(null);
const [showConfirm, setShowConfirm] = useState(false);

const confirmDelete = (id) => { setDeleteId(id); setShowConfirm(true); };
const doDelete = async () => {
  await api.delete(`/items/${deleteId}`);
  setItems(prev => prev.filter(i => i.id !== deleteId));
  setShowConfirm(false);
};
```

---

## Components

Components live in `src/components/`. Import from there.

---

### Modal

**File:** `src/components/Modal.jsx`

The standard modal overlay. Every modal in the application must use this as its outer wrapper. Do not write the overlay `div` yourself.

```jsx
import Modal from '../components/Modal';

{open && (
  <Modal title="Edit user" onClose={handleClose} size="lg">
    {/* modal content goes here */}
  </Modal>
)}
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | string | required | Header text |
| `onClose` | function | required | Called when ✕ is clicked or backdrop is clicked |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Max width of the modal panel |
| `children` | ReactNode | required | Modal body content |

**WRONG - do not do this:**

```jsx
// ❌ Hand-rolled overlay in every modal
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-lg font-semibold">Edit user</h2>
      <button onClick={onClose}>✕</button>
    </div>
    {/* content */}
  </div>
</div>
```

---

### EmptyState

**File:** `src/components/EmptyState.jsx`

Shown when a list is empty. Use it instead of inline empty-state markup.

```jsx
import EmptyState from '../components/EmptyState';
import { PuzzlePieceIcon } from '@heroicons/react/24/outline';

{!loading && items.length === 0 && (
  <EmptyState
    icon={PuzzlePieceIcon}
    title="No integrations yet"
    description="Connect your first integration to get started."
    actionLabel="Add integration"
    onAction={openCreate}
  />
)}
```

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `icon` | Component | Heroicon component (24/outline) |
| `title` | string | Bold heading |
| `description` | string | Optional sub-text |
| `actionLabel` | string | Button label (omit to show no button) |
| `onAction` | function | Button click handler |

**WRONG - do not do this:**

```jsx
// ❌ Inline empty state per page
{items.length === 0 && (
  <div className="text-center py-12">
    <SomeIcon className="mx-auto h-12 w-12 text-gray-400" />
    <h3 className="mt-2 text-sm font-medium text-gray-900">No items</h3>
    <p className="mt-1 text-sm text-gray-500">Get started by creating one.</p>
  </div>
)}
```

---

### StatusBadge

**File:** `src/components/StatusBadge.jsx`

Coloured pill for displaying status values. Use it wherever you render `active`, `inactive`, `error`, or `pending` status.

```jsx
import StatusBadge from '../components/StatusBadge';

<StatusBadge status={item.status} />
```

**Supported statuses and their colours:**

| Status | Colour |
|--------|--------|
| `active` | Green |
| `inactive` | Grey |
| `error` | Red |
| `pending` | Yellow |

Any unrecognised status falls back to grey.

**WRONG - do not do this:**

```jsx
// ❌ Inline ternary per file
<span className={`px-2 py-1 text-xs rounded-full ${
  item.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
}`}>
  {item.status}
</span>
```

---

### TagInput

**File:** `src/components/TagInput.jsx`

An input that manages a list of string tags. Used for categories, labels, tool names, etc.

```jsx
import TagInput from '../components/TagInput';

<TagInput
  tags={formData.tags}
  onChange={(newTags) => setFormData(p => ({ ...p, tags: newTags }))}
  placeholder="Add tag and press Enter"
/>
```

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `tags` | string[] | Current tag list |
| `onChange` | `(tags: string[]) => void` | Called when tags change |
| `placeholder` | string | Input placeholder text |

**WRONG - do not do this:**

```jsx
// ❌ Inline tag state per modal
const [tagInput, setTagInput] = useState('');
const addTag = (e) => {
  if (e.key === 'Enter' && tagInput.trim()) {
    setFormData(p => ({ ...p, tags: [...p.tags, tagInput.trim()] }));
    setTagInput('');
  }
};
```

---

### AuthFieldsGroup

**File:** `src/components/AuthFieldsGroup.jsx`

Renders the auth type selector and the corresponding credential fields (API key, bearer token, username/password, OAuth). Used in integration and composite tool forms.

```jsx
import AuthFieldsGroup from '../components/AuthFieldsGroup';

<AuthFieldsGroup
  authType={formData.authType}
  authData={formData.authData}
  onChange={(authType, authData) => setFormData(p => ({ ...p, authType, authData }))}
/>
```

**WRONG - do not do this:**

```jsx
// ❌ Copy-pasted auth fields block in each modal
<select value={formData.authType} onChange={...}>
  <option value="none">None</option>
  <option value="api-key">API Key</option>
  ...
</select>
{formData.authType === 'api-key' && (
  <input placeholder="API Key" value={formData.authData?.key} onChange={...} />
)}
{formData.authType === 'bearer' && (
  <input placeholder="Bearer token" value={formData.authData?.token} onChange={...} />
)}
```

---

## Utilities

Utilities live in `src/utils/`. Import from there.

---

### getApiError

**File:** `src/utils/apiError.js`

Extracts a human-readable message from any Axios error. Use this in every `catch` block that sets an error state or shows a toast.

```js
import { getApiError } from '../utils/apiError';

try {
  await api.post('/endpoint', data);
} catch (err) {
  setError(getApiError(err));
}
```

This handles all three common shapes:
- `err.response.data.message` (most API errors)
- `err.response.data.error` (some legacy responses)
- `err.message` (network errors, timeouts)

**WRONG - do not do this:**

```js
// ❌ Inconsistent error extraction
setError(err.message);                         // misses API error bodies
setError(err.response?.data?.error);           // misses network errors
setError(err.response?.data?.message || err.message); // close, but inconsistent
```

---

### formatDate / formatDateTime

**File:** `src/utils/date.js`

Consistent date formatting across the application.

```js
import { formatDate, formatDateTime } from '../utils/date';

formatDate('2024-03-15T10:30:00Z')     // → "15 Mar 2024"
formatDateTime('2024-03-15T10:30:00Z') // → "15 Mar 2024, 10:30"
formatDate(null)                        // → "-"
```

Use `formatDate` for dates without time (created dates, expiry dates). Use `formatDateTime` when the time matters (last login, last updated).

**WRONG - do not do this:**

```js
// ❌ Raw Date calls with no consistency
new Date(item.createdAt).toLocaleString()
new Date(item.createdAt).toLocaleDateString()
item.createdAt ? new Date(item.createdAt).toLocaleString('en-GB') : 'N/A'
```

---

## Frontend Anti-Patterns

These patterns are **banned** across the codebase. If you see them in a PR, they must be replaced before merge.

### Inline loading boilerplate

Any combination of `useState(true)` for loading + manual try/finally must use `useFetch` instead. Exception: mutation operations (POST/PUT/DELETE), which use `saving` state from `useFormModal`.

### Inline modal state

Any `showModal` + `editItem` + `formData` state trio must use `useFormModal`.

### Inline delete state

Any `deleteId` + `confirmDelete` + `doDelete` pattern must use `useDeleteConfirm`.

### Raw `err.message` in catch blocks

Always use `getApiError(err)`.

### Raw `new Date(...).toLocaleString()`

Always use `formatDate` or `formatDateTime`.

### Hand-rolled modal overlay div

Always use the `Modal` component.

### Inline status colour ternary

Always use `StatusBadge`.

### Inline empty state block

Always use `EmptyState`.

---

## Frontend PR Checklist

Before opening a pull request for any frontend change, verify every item in this list. Reviewers will check these too.

**Data fetching**
- [ ] Any component that fetches on mount uses `useFetch`, not manual `useState` + `useEffect`
- [ ] All `catch` blocks use `getApiError(err)`, not `err.message` directly

**Modals and forms**
- [ ] Any create/edit modal uses `useFormModal`
- [ ] Any modal outer wrapper uses the `Modal` component (no hand-rolled overlay divs)
- [ ] Delete confirmation uses `useDeleteConfirm`

**List pages**
- [ ] Empty list state uses `EmptyState` component
- [ ] Status values use `StatusBadge` component
- [ ] Date values use `formatDate` or `formatDateTime`

**Forms**
- [ ] Tag/label inputs use `TagInput` component
- [ ] Auth credential fields use `AuthFieldsGroup` component

**General**
- [ ] No logic that is already in a hook or utility has been re-implemented inline
- [ ] No block of code looks identical (or nearly identical) to a block in another file

---

## Adding new shared pieces

If you find yourself writing the same logic a second time across two files, stop and extract it.

### Backend

| What | Where |
|------|-------|
| Pure query helper (where-clause builder, filter) | `server/src/utils/queryHelpers.js` |
| Side-effect helper (cache invalidation, notifications) | `server/src/utils/mcpHelpers.js` |
| Reusable middleware (auth guard, role guard) | `server/src/middleware/` |
| Other pure utility (formatting, parsing) | `server/src/utils/<descriptiveName>.js` |

### Frontend

| What | Where |
|------|-------|
| Pure function (no React) | `src/utils/<descriptiveName>.js` |
| Stateful logic, no JSX | `src/hooks/useXxx.js` |
| UI with no business logic | `src/components/` |
| UI with coupled logic (e.g. TagInput) | `src/components/` |

When you add a new shared piece, **update this document in the same PR**. A piece that exists but is not documented here will be reinvented by the next developer.
