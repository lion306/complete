FROM node:20-alpine

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --only=production

COPY backend/ .

RUN mkdir -p uploads logs

EXPOSE 3001

CMD ["node", "src/server.js"]
