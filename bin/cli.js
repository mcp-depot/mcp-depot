#!/usr/bin/env node
'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const args = process.argv.slice(2);

if (args.includes('--mcp')) {
  require('../server/src/mcp/server.js');
} else {
  const serveClient = !args.includes('--server');
  process.env.SERVE_CLIENT = serveClient ? 'true' : 'false';

  if (!process.env.DATABASE_URL) {
    const dataDir = path.join(os.homedir(), '.mcpconnect');
    fs.mkdirSync(dataDir, { recursive: true });
    process.env.SQLITE_PATH = path.join(dataDir, 'data.db');
  }

  require('../server/src/server.js');

  const port = process.env.PORT || 3000;
  console.log(`MCPConnect running at http://localhost:${port}`);
  if (!process.env.DATABASE_URL) {
    console.log(`Database: SQLite (~/.mcpconnect/data.db)`);
  }
}