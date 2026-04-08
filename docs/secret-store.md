# Secret Store Setup (Infisical)

MCPConnect can integrate with [Infisical](https://infisical.com) to manage secrets externally. This allows you to store API tokens, keys, and other sensitive credentials in Infisical instead of directly in MCPConnect.

## Why Use Infisical?

- **Centralized secrets management** - One place for all your API credentials
- **No secrets in database** - Credentials stored externally, referenced by path
- **Rotation friendly** - Update secrets in Infisical without changing MCPConnect config
- **Audit trail** - Infisical logs who accessed which secrets

## Quick Start (Self-Hosted)

```bash
# Start Infisical alongside MCPConnect
docker-compose --profile secret-store up -d

# Access at http://localhost:8080
```

---

## Infisical Setup Guide

### For Self-Hosted v0.146.2+

#### Step 1: Create Organization and Project

1. Go to `http://localhost:8080` and create your admin account
2. Click **Create Organization** → enter name (e.g., "MCPConnect")
3. Inside the org, click **Create Project** → enter name (e.g., "API Keys")

#### Step 2: Create Identity (Machine User)

1. Navigate to **Organization Settings** → **Access Control** → **Identities**
2. Click **Create identity**
3. Enter details:
   - **Name**: `MCPConnect`
   - **Role**: `Admin` (or `Member`)
4. Click **Create**

#### Step 3: Configure Universal Auth

1. After creating, you'll be on the identity page
2. In the **Authentication** section, find **Universal Auth**
3. Click **Create Client Secret**
4. Copy and save:
   - **Client ID** (shown immediately)
   - **Client Secret** (shown once - **save immediately!**)

#### Step 4: Add Identity to Project

1. Go to your **Project** → **Project Settings** → **Access Control** → **Machine Identities**
2. Click **Add identity**
3. Select your identity and assign a **Project Role** (e.g., `Developer`, `Admin`)

#### Step 5: Create Secrets

1. Go to **Secrets** tab in your project
2. Click **Add Secret**
3. Add your secrets, e.g.:
   - `JIRA_API_TOKEN` = your Jira API token
   - `GITHUB_TOKEN` = your GitHub token

#### Step 6: Get IDs

- **Organization ID**: In URL `http://localhost:8080/org/<org-id>/settings/...`
- **Project ID**: In URL `http://localhost:8080/project/<project-id>/secrets/...`
- **Environment**: Go to project → **Environments** tab → note your environment names (e.g., `dev`, `prod`)

> **Important**: Use the **Project ID** (not Organization ID) for `SECRET_STORE_WORKSPACE_ID`

---

## MCPConnect Configuration

Add to your `.env` file:

```bash
# Enable Secret Store
SECRET_STORE_ENABLED=true

# Infisical URL (self-hosted)
SECRET_STORE_SITE_URL=http://localhost:8080

# Credentials from Step 3
SECRET_STORE_CLIENT_ID=your-client-id
SECRET_STORE_CLIENT_SECRET=your-client-secret

# IDs from Step 6
SECRET_STORE_WORKSPACE_ID=your-org-id
SECRET_STORE_ENVIRONMENT=dev
```

Then restart: `docker compose up -d server`

---

## Using Secrets in MCPConnect

### In Integration Credentials

When adding an integration in MCPConnect UI:

1. Select **Auth Type** → **Infisical Secret**
2. Enter **Secret Reference** in format:
   ```
   infisical://dev/JIRA_API_TOKEN
   ```
   - `dev` = environment name from Step 6
   - `JIRA_API_TOKEN` = secret name from Step 5

3. Enter **Key Name** (e.g., `token`, `api_key`, `password`)

### Secret Path Format

| Format | Example | Description |
|--------|---------|-------------|
| `infisical://env/secret-name` | `infisical://dev/JIRA_TOKEN` | Root-level secret |
| `infisical://prod/backend/API_KEY` | `infisical://prod/github/TOKEN` | Secret in folder |

---

## For Infisical Cloud

The setup is identical, but use these URLs:
- **Site URL**: `https://app.infisical.com` (or `https://eu.infisical.com` for EU)
- **Organization ID**: Found in organization settings

---

## Troubleshooting

### "Invalid credentials" when resolving secrets

1. Verify Client ID/Secret are correct
2. Ensure identity is added to the project (Step 4)
3. Check identity has appropriate project role

### "Secret not found"

1. Verify environment name matches exactly (case-sensitive)
2. Check secret name is correct
3. Ensure secrets exist in that environment

### Container won't start

- Ensure PostgreSQL and Valkey are running first
- Check `ENCRYPTION_KEY` is exactly 16 bytes (hex): `openssl rand -hex 16`
- Check `AUTH_SECRET` is exactly 32 bytes (base64): `openssl rand -base64 32`