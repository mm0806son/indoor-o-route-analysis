# Docker Setup Guide

This document provides instructions for building and running the Indoor O-Route Analysis application in Docker.

## Overview

The Dockerfile implements a production-quality, security-hardened multi-stage build process optimized for Next.js static exports.

## Security Features

### 1. **Multi-Stage Build**
- Reduces final image size by separating build dependencies from runtime
- Excludes build tools from the production image
- Minimizes attack surface

### 2. **Non-Root User**
- Application runs as `nextjs` user (UID 1001) instead of root
- Prevents privilege escalation attacks
- Complies with container security best practices (PSP/Kubernetes)

### 3. **Minimal Base Image**
- Uses `node:22-alpine` instead of full-featured images
- Alpine Linux provides security updates and smaller footprint
- Reduced number of packages = fewer vulnerabilities

### 4. **Security Hardening**
- Automatic security updates in each stage (`apk upgrade`)
- Removed package manager cache to reduce image size
- Proper signal handling with `dumb-init`
- Healthcheck configured for monitoring

### 5. **Resource Isolation**
- Drop all unnecessary Linux capabilities
- Only allow `NET_BIND_SERVICE` for binding to port 3000
- CPU and memory limits configured in docker-compose

### 6. **Supply Chain Security**
- Frozen `pnpm-lock.yaml` ensures reproducible builds
- Explicit version pinning prevents unexpected updates
- Signature verification for dependencies

## Building the Image

### Basic Build
```bash
docker build -t indoor-o-route-analysis:latest .
```

### Build with Progress Output
```bash
docker build --progress=plain -t indoor-o-route-analysis:latest .
```

### Build with Build Args (for multi-environment support)
```bash
docker build \
  --build-arg NODE_ENV=production \
  -t indoor-o-route-analysis:v1.0.0 \
  .
```

## Running the Container

### Using Docker Run
```bash
docker run -d \
  --name indoor-o-route-analysis \
  -p 3000:3000 \
  --restart unless-stopped \
  --security-opt=no-new-privileges:true \
  indoor-o-route-analysis:latest
```

### Using Docker Compose (Recommended)
```bash
docker-compose up -d
```

### View Logs
```bash
docker-compose logs -f app
```

### Stop Container
```bash
docker-compose down
```

## Alternative Container Runtimes

This application works seamlessly with popular container runtime alternatives to Docker Desktop.

### OrbStack (macOS & Linux)

OrbStack is a lightweight, fast container manager optimized for macOS and Linux.

#### Setup
```bash
# Install OrbStack (macOS with Homebrew)
brew install orbstack

# Start OrbStack
orbstack start
```

#### Usage
OrbStack is fully compatible with Docker CLI and docker-compose commands:

```bash
# Build image
docker build -t indoor-o-route-analysis:latest .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop
docker-compose down
```

**Benefits:**
- Faster startup times than Docker Desktop
- Lower memory footprint
- Native macOS integration
- Free and open source

### Colima (macOS & Linux)

Colima provides container runtimes (Docker, Podman) on macOS and Linux with minimal setup.

#### Setup
```bash
# Install Colima (macOS with Homebrew)
brew install colima

# Start Colima with Docker runtime
colima start

# Alternatively, start with Podman runtime
colima start --runtime podman
```

#### Usage with Docker Runtime
```bash
# Build image
docker build -t indoor-o-route-analysis:latest .

# Run with docker-compose
docker-compose up -d

# View container status
colima list

# Check logs
docker-compose logs -f app

# Stop
docker-compose down

# Stop Colima VM
colima stop
```

#### Configuration (Optional)
Create `~/.colima/colima.yaml` to customize resource allocation:

```yaml
runtime: docker
arch: aarch64  # or x86_64
cpu: 4
memory: 8     # in GiB
disk: 50      # in GiB
```

**Benefits:**
- Lightweight VM compared to Docker Desktop
- Resource-efficient
- Supports multiple runtimes
- Works on Intel and Apple Silicon

### Podman (Linux & macOS with Colima)

Podman is a daemonless, open-source container engine that's API-compatible with Docker.

#### Setup on Linux
```bash
# Install Podman (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y podman

# Or on Fedora/RHEL
sudo dnf install -y podman

# Enable rootless mode (recommended)
podman system setup --rootless
```

#### Setup on macOS (via Colima)
```bash
# Install Colima
brew install colima

# Start with Podman runtime
colima start --runtime podman
```

#### Usage with Podman
```bash
# Build image
podman build -t indoor-o-route-analysis:latest .

# Run container directly
podman run -d \
  --name indoor-o-route-analysis \
  -p 3000:3000 \
  --restart unless-stopped \
  indoor-o-route-analysis:latest

# Or use podman-compose (install separately if needed)
pip install podman-compose

# Then use docker-compose syntax
podman-compose up -d

# View running containers
podman ps

# View logs
podman logs -f indoor-o-route-analysis

# Stop container
podman stop indoor-o-route-analysis

# Remove container
podman rm indoor-o-route-analysis
```

#### Podman-specific Tips
```bash
# Enable rootless containers (recommended for security)
podman system setup --rootless

# Check Podman version
podman --version

# List all images
podman images

# Clean up unused images and containers
podman image prune
podman container prune

# Run with podman-compose from docker-compose.yml
alias docker-compose='podman-compose'
docker-compose up -d
```

**Benefits:**
- No daemon required (rootless by default)
- Better security isolation
- API-compatible with Docker
- Native Linux support
- Excellent for CI/CD and production

### Comparison Table

| Feature | Docker Desktop | OrbStack | Colima | Podman |
|---------|---|---|---|---|
| **macOS** | ✅ | ✅ | ✅ | ✅* |
| **Linux** | ✅ | ✅ | ✅ | ✅ |
| **Memory Efficient** | ⚠️ | ✅ | ✅ | ✅ |
| **Cost** | Paid (license) | Free | Free | Free |
| **Rootless** | ⚠️ | ✅ | ✅ | ✅ |
| **Daemon Required** | ✅ | ✅ | ✅ | ❌ |
| **Docker CLI Compatible** | ✅ | ✅ | ✅ | ✅ |
| **Compose Support** | ✅ | ✅ | ✅ | ✅** |

\* macOS support via Colima  
\*\* Via podman-compose

### Migration Guide

#### From Docker Desktop to OrbStack
```bash
# Stop Docker Desktop
# Start OrbStack
orbstack start

# No additional steps needed - use docker commands as before
docker-compose up -d
```

#### From Docker Desktop to Colima
```bash
# Export images from Docker (optional)
docker save myimage:tag | gzip > myimage.tar.gz

# Stop Docker Desktop
# Start Colima
colima start

# Import images (optional)
docker load < myimage.tar.gz

# Use docker commands as before
docker-compose up -d
```

#### From Docker to Podman
```bash
# Tag images for Podman
docker tag indoor-o-route-analysis:latest localhost/indoor-o-route-analysis:latest

# Export to Podman (if migrating from Docker)
docker save indoor-o-route-analysis:latest | podman load

# Update any docker-compose commands
podman-compose up -d

# Or set alias for compatibility
alias docker=podman
alias docker-compose=podman-compose
```

### Troubleshooting Runtime Issues

**OrbStack:**
```bash
# Restart OrbStack
orbstack stop
orbstack start

# Check status
orbstack status
```

**Colima:**
```bash
# Restart Colima VM
colima stop
colima start

# Check logs
cat ~/.colima/default/log
```

**Podman:**
```bash
# Check service status (systemd on Linux)
systemctl --user status podman.socket

# Restart podman service
systemctl --user restart podman

# On macOS with Colima
colima stop
colima start --runtime podman
```

## Environment Variables

The following environment variables are configured by default:

- `NODE_ENV=production` - Set to production mode
- `PORT=3000` - Application port
- `HOSTNAME=0.0.0.0` - Listen on all interfaces

To override these, create a `.env` file in the root directory:

```env
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
```

## Health Checks

The container includes a healthcheck that:
- Runs every 30 seconds
- Has a 3-second timeout
- Requires 3 consecutive successes to be considered healthy
- Starts checking after 5 seconds (start-period)

Check health status:
```bash
docker inspect --format='{{.State.Health.Status}}' indoor-o-route-analysis
```

## Image Size Optimization

The current setup produces an image optimized for size through:

1. **Alpine Linux Base** (~173 MB)
2. **Minimal Dependencies** - Only runtime packages
3. **.dockerignore** - Excludes unnecessary files during build
4. **Layer Caching** - Dependencies cached separately from code

Approximate image sizes:
- `builder` stage: ~800 MB
- Final `runtime` stage: ~250-300 MB

## Best Practices Applied

### Development vs Production
- Use `docker-compose.yml` for local development
- Create separate compose files for different environments (e.g., `docker-compose.prod.yml`)

### Monitoring
- Implement container logs aggregation in production
- Set up alerts for failed healthchecks
- Use container orchestration (Kubernetes) for advanced features

### Updates
- Rebuild images when dependencies are updated
- Use semantic versioning for image tags
- Implement CI/CD pipeline for automated builds

## Kubernetes Deployment

Example Kubernetes manifest:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: indoor-o-route-analysis
spec:
  replicas: 3
  selector:
    matchLabels:
      app: indoor-o-route-analysis
  template:
    metadata:
      labels:
        app: indoor-o-route-analysis
    spec:
      containers:
      - name: app
        image: indoor-o-route-analysis:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "2000m"
        securityContext:
          runAsNonRoot: true
          runAsUser: 1001
          readOnlyRootFilesystem: true
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
            add:
            - NET_BIND_SERVICE
          seccompProfile:
            type: RuntimeDefault
```

## Troubleshooting

### Container exits immediately
```bash
docker logs indoor-o-route-analysis
```

### Port already in use
```bash
# Change port in docker-compose.yml from 3000 to another port
# Or kill the process using port 3000
lsof -i :3000
kill -9 <PID>
```

### Out of memory
Increase memory limit in docker-compose.yml:
```yaml
deploy:
  resources:
    limits:
      memory: 2G
```

### Slow builds
- Use BuildKit: `DOCKER_BUILDKIT=1 docker build ...`
- Check network connectivity
- Consider using a build cache volume

## Security Scanning

### Scan image for vulnerabilities
```bash
# Using Trivy
trivy image indoor-o-route-analysis:latest

# Using Snyk
snyk container test indoor-o-route-analysis:latest
```

### Check image layers
```bash
docker history indoor-o-route-analysis:latest
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: docker/build-push-action@v4
      with:
        context: .
        push: true
        tags: myregistry/indoor-o-route-analysis:${{ github.ref_name }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

## Additional Resources

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Node.js Docker Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [OWASP Container Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [Alpine Linux](https://alpinelinux.org/)
- [Dumb-init](https://github.com/Yelp/dumb-init)
