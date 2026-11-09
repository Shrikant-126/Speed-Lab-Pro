# SpeedLab Pro worker – Playwright + Chromium + Sharp (+ optional local Lighthouse)
# Build from the repository root:  docker build -f worker/Dockerfile -t speedlab-worker .
FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY worker/package.json worker/
RUN npm install --workspace @speedlab/shared --workspace @speedlab/worker --omit=dev --no-audit --no-fund \
 && npx playwright install chromium

COPY shared shared
COPY worker worker

# Run as the unprivileged user provided by the Playwright image.
USER pwuser
EXPOSE 8787
CMD ["node", "worker/src/index.js"]
