FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --only=production

RUN apk add --no-cache python3 py3-pip

RUN mkdir -p /opt/mcp-packages/node /opt/mcp-packages/python

COPY . .

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/index.js"]