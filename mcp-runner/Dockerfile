FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --only=production

RUN apk add --no-cache python3 py3-pip

# uv/uvx is a common way modern Python-based MCP servers are distributed
# (e.g. `uvx some-mcp-server`) - it's in the stdio command allowlist
# (server's routes/external-mcp.js ALLOWED_STDIO_COMMANDS) but wasn't actually
# installed, so any uvx-based external MCP server would fail in this image
# even though the exact same config could work on a host that happened
# to have uv installed separately.
RUN pip3 install --no-cache-dir --break-system-packages uv

RUN mkdir -p /opt/mcp-packages/node /opt/mcp-packages/python

COPY . .

EXPOSE 9500

ENV NODE_ENV=production
ENV PORT=9500

CMD ["node", "src/index.js"]
