# syntax=docker/dockerfile:1
#
# Builds a self-contained chatbot deployment. Build from the repo root:
#   docker build -f docker/Dockerfile -t personal-assistant-chatbot .
#
# The image runs the Next.js template app, which serves the public chat page,
# the /admin/chatbot console, the /api/chat endpoint, and the embed bundle.

# ---- Stage 1: build the SDK and pack it as a tarball -----------------------
FROM node:22-alpine AS sdk
WORKDIR /sdk
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && mv "$(npm pack --silent)" /tmp/pac.tgz

# ---- Stage 2: build the Next.js app ----------------------------------------
FROM node:22-alpine AS app
WORKDIR /app
COPY templates/nextjs/ ./
COPY --from=sdk /tmp/pac.tgz ./pac.tgz
# The embed bundle is served as a static asset at /embed.js.
COPY --from=sdk /sdk/dist/vanilla.global.js ./public/embed.js
RUN sed -i 's/{{projectName}}/personal-assistant-chatbot-app/' package.json \
 && npm pkg set dependencies.personal-assistant-chatbot=file:./pac.tgz \
 && npm install --no-audit --no-fund \
 && npm run build

# ---- Stage 3: minimal runtime ----------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV CHATBOT_DATA_DIR=/data
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user; /data is the persisted volume for profile + secrets.
RUN addgroup -S pac && adduser -S pac -G pac && mkdir -p /data && chown pac:pac /data

# Next.js standalone output: server bundle, then static assets and public/.
COPY --from=app --chown=pac:pac /app/.next/standalone ./
COPY --from=app --chown=pac:pac /app/.next/static ./.next/static
COPY --from=app --chown=pac:pac /app/public ./public

USER pac
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
