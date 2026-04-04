FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --only=production

# Install Python and pip for Python-based MCP servers
RUN apk add --no-cache python3 py3-pip && \
    pip3 install --break-system-packages uv

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
