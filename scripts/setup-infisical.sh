#!/bin/bash
set -e

echo "Setting up Infisical database..."

# Wait for postgres
until docker exec mcpconnect-postgres pg_isready -U admin -d mcpconnect > /dev/null 2>&1; do
  echo "Waiting for postgres..."
  sleep 2
done

# Create infisical database if it doesn't exist
docker exec mcpconnect-postgres psql -U admin -d mcpconnect -c "SELECT 1 FROM pg_database WHERE datname = 'infisical'" | grep -q 1 || \
  docker exec mcpconnect-postgres psql -U admin -d mcpconnect -c "CREATE DATABASE infisical;"

echo "Infisical database ready."

# Start Infisical
docker-compose --profile secret-store up -d infisical valkey

# Wait for Infisical to be ready
echo "Waiting for Infisical to start..."
sleep 30

# Check if Infisical is running
if docker ps --format "{{.Names}}" | grep -q mcpconnect-infisical; then
  echo "Infisical is running at http://localhost:8080"
  echo "IMPORTANT: You need to:"
  echo "1. Open http://localhost:8080 in browser"
  echo "2. Complete initial setup (create admin account)"
  echo "3. Go to Settings → Universal Auth → Create Client"
  echo "4. Copy Client ID and Client Secret"
  echo "5. Share them so we can configure MCPConnect"
else
  echo "Infisical failed to start. Check logs with:"
  echo "docker logs mcpconnect-infisical"
fi
