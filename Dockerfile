# =============================================================================
# CyberChef Web Application - Hardened Docker Image
# =============================================================================
# Security Features:
# - Non-root user execution (nginx user)
# - Health check for container orchestration
# - Minimal attack surface with Alpine base
# - Node.js 22 LTS for build stage (crypto global + ES module support)
# =============================================================================

#####################################
# Build the app to a static website #
#####################################
# Modifier --platform=$BUILDPLATFORM limits the platform to "BUILDPLATFORM" during buildx multi-platform builds
# This is because npm "chromedriver" package is not compatiable with all platforms
# For more info see: https://docs.docker.com/build/building/multi-platform/#cross-compilation
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

WORKDIR /app

COPY package.json .
COPY package-lock.json .

# Install dependencies
# --ignore-scripts prevents postinstall script (which runs grunt) as it depends on files other than package.json
RUN npm ci --ignore-scripts

# Copy files needed for postinstall and build
COPY . .

# Apply patches for Node 22 compatibility (SlowBuffer deprecation)
# These packages use the deprecated SlowBuffer which was removed/changed in newer Node versions
RUN sed -i 's/new SlowBuffer/Buffer.alloc/g' node_modules/avsc/lib/types.js && \
    sed -i 's/SlowBuffer/Buffer/g' node_modules/buffer-equal-constant-time/index.js

# npm postinstall runs grunt, which depends on files other than package.json
RUN npm run postinstall

# Build the app with increased memory for webpack (Docker Hub has constrained resources)
# Increase Node heap size to 4GB to handle webpack's worker compilation
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

#########################################
# Package static build files into nginx #
#########################################
# Package into nginx for serving
FROM nginx:1.29-alpine-slim AS cyberchef

# Security: Add metadata labels
LABEL org.opencontainers.image.title="CyberChef Web Application" \
      org.opencontainers.image.description="Web-based data manipulation tool with 300+ operations" \
      org.opencontainers.image.vendor="GCHQ" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://github.com/gchq/CyberChef"

COPY --from=builder /app/build/prod /usr/share/nginx/html/

# Security: Set proper ownership for nginx user and cache directories
# The alpine-slim variant requires explicit cache directory setup for non-root execution
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    mkdir -p /var/cache/nginx/client_temp \
             /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp \
             /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/run && \
    chown -R nginx:nginx /run

# Security: Switch to non-root user (nginx user is built into nginx:alpine)
USER nginx

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

EXPOSE 80
