# ============================================================
# N.E.X.A Cloud Core — Dockerfile for VPS Deployment
# Platform: VPS (Ubuntu/Debian)
# Port: 3000
# ============================================================

# Use Node.js 20 LTS slim variant — smaller image, faster build
FROM node:20-slim

# Set working directory inside the container
WORKDIR /app

# Install system dependencies required for network operations
# node:20-slim strips curl, wget, and full CA certificates — causing TLS failures
# to api.telegram.org. We MUST restore them for Vision Engine image downloads.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests FIRST (leverages Docker layer caching)
# This layer is only rebuilt if package.json changes, not on every code change
COPY package.json package-lock.json ./

# Install ONLY production dependencies — no devDependencies
# --omit=dev is the correct flag for npm v7+ (Node 20). --frozen-lockfile is implicit in npm ci.
RUN npm ci --omit=dev

# Copy the rest of the application source code
COPY . .

# VPS default port
ENV PORT=3000
ENV NODE_ENV=production

# Expose port 3000
EXPOSE 3000

# Health check: Docker will verify the container is responding correctly
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the N.E.X.A server
CMD ["node", "src/app.js"]
