FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm --prefix gr8r-axi ci

ENV GR8R_DB=/data/gr8r.db
EXPOSE 5173 8787

CMD ["sh", "-c", "mkdir -p /data && node gr8r-axi/bin/gr8r-axi.js init && node gr8r-axi/bin/gr8r-axi.js serve --port 8787 & npx vite --host 0.0.0.0 --port 5173"]
