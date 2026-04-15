# Multi-stage build for production-quality, secure Docker image
# Stage 1: Build dependencies
FROM node:22-alpine AS deps

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init

WORKDIR /build

# Copy dependency files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install pnpm
RUN npm install -g pnpm@latest

# Install dependencies with frozen lockfile for reproducibility
RUN pnpm install --frozen-lockfile --ignore-scripts

# Stage 2: Build application
FROM node:22-alpine AS builder

RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init

WORKDIR /build

# Copy node_modules from deps stage
COPY --from=deps /build/node_modules ./node_modules

# Copy source code and configuration
COPY . .

# Install pnpm
RUN npm install -g pnpm@latest

# Run postinstall scripts if needed
RUN pnpm run postinstall || true

# Build the application
RUN pnpm run build

# Stage 3: Production runtime
FROM node:22-alpine AS runtime

# Install security updates and runtime dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl && \
    rm -rf /var/cache/apk/*

# Create non-root user with minimal privileges
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

# Copy dumb-init
COPY --from=builder /usr/bin/dumb-init /usr/bin/dumb-init

# Copy built application from builder
COPY --from=builder --chown=nextjs:nodejs /build/out ./public

# Copy package files for reference (minimal size impact)
COPY --chown=nextjs:nodejs package.json ./

# Set Node.js to production mode
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Switch to non-root user
USER nextjs

# Expose port (documentation only)
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start Next.js in standalone mode (static export)
CMD ["npx", "serve", "-s", "public", "-l", "3000"]
