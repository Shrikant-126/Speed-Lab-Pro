# SpeedLab Pro worker – Playwright + Chromium + Sharp (+ optional local Lighthouse)
# Build from the repository root:  docker build -f worker/Dockerfile -t speedlab-worker .
# The base image version MUST match the "playwright" version in package-lock.json,
# because the image already contains the matching Chromium build in /ms-playwright.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DATA_DIR=/tmp/speedlab-data

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY worker/package.json worker/
COPY server/package.json server/
COPY client/package.json client/
RUN npm install --workspace @speedlab/shared --workspace @speedlab/worker --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY shared shared
COPY worker worker

# Run as the unprivileged user provided by the Playwright image.
USER pwuser
EXPOSE 8787
CMD ["node", "worker/src/index.js"]
