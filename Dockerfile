FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --only=production
RUN apk add --no-cache python3 py3-pip
RUN mkdir -p /opt/mcp-packages/node /opt/mcp-packages/python
COPY server/ .
COPY --from=client-builder /app/client/dist /client/dist
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
CMD ["node", "src/index.js"]
