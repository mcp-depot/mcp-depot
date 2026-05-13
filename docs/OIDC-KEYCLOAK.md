# OIDC Authentication with Keycloak

This guide covers setting up Keycloak as an OIDC provider for MCP Depot. Keycloak is optional - MCP Depot works out of the box with email/password login. Use this if you want SSO for your team.

## Prerequisites

- Docker and Docker Compose installed
- MCP Depot not yet started, or stopped (`docker-compose down`)

## Step 1: Start with the Keycloak compose file

```bash
docker-compose -f docker-compose-keycloak.yml up -d
```

This starts Postgres, the MCP Depot server and client, and Keycloak on port `8180`.

## Step 2: Create the Keycloak realm

1. Open `http://localhost:8180` in your browser
2. Click **Administration Console**
3. Log in with username `admin`, password `admin`
4. In the top-left dropdown (shows "Keycloak") click **Create Realm**
5. Set **Realm name** to `mcp-depot`
6. Click **Create**

## Step 3: Create the OIDC client

1. In the left sidebar, go to **Clients** → **Create client**
2. Set **Client type** to `OpenID Connect`
3. Set **Client ID** to `mcp-depot`
4. Click **Next**
5. On the Capability config screen, toggle **Client authentication** to **ON**
6. Click **Next**
7. On the Login settings screen:
   - **Valid redirect URIs**: `http://localhost:5173/login`
   - **Web origins**: `http://localhost:5173`
8. Click **Save**

## Step 4: Copy the client secret

1. On the client page, go to the **Credentials** tab
2. Copy the **Client secret** value

## Step 5: Configure MCP Depot

Add or update these values in your `.env` file:

```env
OIDC_ENABLED=true
OIDC_ISSUER_URL=http://keycloak:8080/realms/mcp-depot
OIDC_ISSUER_PUBLIC_URL=http://localhost:8180/realms/mcp-depot
OIDC_CLIENT_ID=mcp-depot
OIDC_CLIENT_SECRET=<paste secret from Step 4>
OIDC_DISPLAY_NAME=Login with Keycloak
```

Then restart the server:

```bash
docker-compose -f docker-compose-keycloak.yml restart server
```

## Step 6: Create the admin realm role (optional)

Skip this if you want all Keycloak users to be regular users in MCP Depot (roles are managed in MCP Depot's Users page).

1. In Keycloak left sidebar → **Realm roles** → **Create role**
2. Set **Role name** to `admin`
3. Click **Save**
4. Go to **Users** → select your admin user → **Role mapping** tab → **Assign role** → select `admin`

## Step 7: Create users in Keycloak

Any user who needs to log in via Keycloak must have a Keycloak account:

1. Left sidebar → **Users** → **Add user**
2. Fill in **Username** and **Email**
3. Toggle **Email verified** to **ON**
4. Click **Create**
5. Go to the **Credentials** tab → **Set password**
6. Enter a password and toggle **Temporary** to **OFF**
7. Click **Save password**

## Step 8: Test the login

1. Open `http://localhost:5173`
2. Click **Login with Keycloak**
3. You will be redirected to Keycloak's login page
4. Enter the credentials you created in Step 7
5. You will be redirected back to MCP Depot and logged in

On first login, MCP Depot auto-creates a local account for the user with `role: user`. A MCP Depot admin can promote them to admin via **Settings → Users**.

## Managing user roles

Keycloak handles authentication (who you are). MCP Depot manages authorization (what you can do):

1. Log in to MCP Depot as an admin
2. Go to **Settings → Users**
3. Click the edit icon next to a user
4. Change the **Role** dropdown to `admin`
5. Click **Save**

## Keycloak data persistence

The `docker-compose-keycloak.yml` file includes a named volume (`mcp-depot_keycloak-data`) so your realm configuration survives container restarts and `docker-compose down`. The data is only lost if you explicitly remove the volume:

```bash
docker-compose -f docker-compose-keycloak.yml down -v  # removes all volumes including keycloak data
```

## Environment variables reference

| Variable | Description | Example |
|----------|-------------|---------|
| `OIDC_ENABLED` | Enable OIDC login button | `true` |
| `OIDC_ISSUER_URL` | Issuer URL used by the server (internal Docker hostname) | `http://keycloak:8080/realms/mcp-depot` |
| `OIDC_ISSUER_PUBLIC_URL` | Issuer URL used by the browser (public hostname) | `http://localhost:8180/realms/mcp-depot` |
| `OIDC_CLIENT_ID` | Client ID registered in Keycloak | `mcp-depot` |
| `OIDC_CLIENT_SECRET` | Client secret from Keycloak Credentials tab | `abc123...` |
| `OIDC_DISPLAY_NAME` | Label shown on the login button | `Login with Keycloak` |

> **Note:** `OIDC_ISSUER_URL` and `OIDC_ISSUER_PUBLIC_URL` must point to the same Keycloak realm but use different hostnames. The server uses `OIDC_ISSUER_URL` for token exchange (container-to-container). The browser uses `OIDC_ISSUER_PUBLIC_URL` for the authorization redirect.
