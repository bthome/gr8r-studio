FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm --prefix gr8r-axi ci

ENV GR8R_DB=/data/gr8r.db
EXPOSE 5173 8787

# Uses the Node already in the image. /health needs no passphrase and returns no board data.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["sh", "scripts/docker-start.sh"]
