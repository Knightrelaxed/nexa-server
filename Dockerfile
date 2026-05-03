# ============================================================
# N.E.X.A Cloud Core — Dockerfile for Hugging Face Spaces
# Platform: Hugging Face Docker Space (Free Tier)
# CRITICAL: HF Spaces REQUIRES port 7860
# ============================================================

# Use Node.js 20 LTS slim variant — smaller image, faster build
FROM node:20-slim

# Set working directory inside the container
WORKDIR /app

# Copy dependency manifests FIRST (leverages Docker layer caching)
# This layer is only rebuilt if package.json changes, not on every code change
COPY package.json package-lock.json ./

# Install ONLY production dependencies — no devDependencies
# --omit=dev is the correct flag for npm v7+ (Node 20). --frozen-lockfile is implicit in npm ci.
RUN npm ci --omit=dev

# Copy the rest of the application source code
COPY . .

# Hugging Face Spaces MANDATES port 7860
# This ENV sets the default, but HF will also inject PORT=7860 itself
ENV PORT=7860
ENV NODE_ENV=production

# Expose port 7860 for HF routing layer
EXPOSE 7860

# Health check: Docker will verify the container is responding correctly
# This also helps HF detect container health before routing traffic
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7860/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the N.E.X.A server
CMD ["node", "src/app.js"]
