# --- builder --------------------------------------------------------------
# Also used directly as the dev container (docker-compose.dev.yml targets it).
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY . .

RUN npm run build

# --- runtime --------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache tini

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/40-jobradar-config.sh
RUN chmod +x /docker-entrypoint.d/40-jobradar-config.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
