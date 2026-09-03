FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/argus-pr

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY bin ./bin
COPY src ./src
COPY web ./web

RUN useradd --system --create-home --home-dir /var/lib/argus-pr argus \
    && mkdir -p /var/lib/argus-pr/media \
    && chown -R argus:argus /var/lib/argus-pr /opt/argus-pr

USER argus

ENV NODE_ENV=production \
    ARGUS_HOST=0.0.0.0 \
    ARGUS_PORT=8443 \
    ARGUS_DATA_DIR=/var/lib/argus-pr \
    ARGUS_MEDIA_DIR=/var/lib/argus-pr/media

EXPOSE 8443

VOLUME ["/var/lib/argus-pr"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD NODE_TLS_REJECT_UNAUTHORIZED=0 node -e "fetch('https://127.0.0.1:8443/api/system/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "bin/argus.js", "serve"]
