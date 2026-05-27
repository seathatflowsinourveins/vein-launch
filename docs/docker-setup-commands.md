# SOTA Docker Setup Commands — Ready to Execute

> Run these in order. WSL2 must be installed first.

## Phase 0: WSL2 + Docker Desktop

```powershell
# 1. Install WSL2 (REBOOT REQUIRED after this)
wsl --install

# 2. After reboot — verify WSL2
wsl --version
# Should show: WSL version 2.x.x

# 3. Install Docker Desktop
winget install Docker.DockerDesktop

# 4. Configure Docker Desktop (GUI):
#    - Settings → General → "Use the WSL 2 based engine" ✓
#    - Settings → Resources → WSL Integration → Enable for your distro
#    - Settings → Resources → Disk image location → leave default (or faster NVMe)

# 5. Create .wslconfig for resource limits
```

```powershell
# Create C:\Users\seath\.wslconfig
@"
[wsl2]
memory=16GB
processors=8
swap=4GB
localhostForwarding=true

[experimental]
autoMemoryReclaim=gradual
"@ | Set-Content -Path "$env:USERPROFILE\.wslconfig" -Encoding UTF8
```

```powershell
# 6. Restart WSL2 to apply limits
wsl --shutdown
```

## Phase 1: Docker Directory Structure (Inside WSL2)

```bash
# Enter WSL2
wsl

# Create the Docker home
mkdir -p ~/docker/{cliproxy/{secrets,logs},trading/{secrets},backups,scripts}

# Verify
tree ~/docker/
```

## Phase 2: CLIProxy Docker Stack

```bash
# ~/docker/cliproxy/compose.yml
cat > ~/docker/cliproxy/compose.yml << 'EOF'
name: cliproxy

services:
  cliproxy:
    image: eceasy/cli-proxy-api:latest
    pull_policy: always
    container_name: cliproxy
    restart: unless-stopped
    ports:
      - "127.0.0.1:8317:8317"
      - "127.0.0.1:8085:8085"
      - "127.0.0.1:54545:54545"
      - "127.0.0.1:1455:1455"
    volumes:
      - ./config.yaml:/CLIProxyAPI/config.yaml:ro
      - cliproxy-auths:/root/.cli-proxy-api
      - ./logs:/CLIProxyAPI/logs
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:8317/v1/models > /dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    develop:
      watch:
        - path: ./config.yaml
          action: sync+restart
          target: /CLIProxyAPI/config.yaml

volumes:
  cliproxy-auths:
    name: cliproxy-auths
EOF

# Generate config.yaml from CLIProxy example
cat > ~/docker/cliproxy/config.yaml << 'EOF'
host: "0.0.0.0"
port: 8317

routing:
  strategy: "round-robin"
  session-affinity: true

claude-header-defaults:
  stabilize-device-profile: true

request-retry: 3
max-retry-credentials: 2

# Uncomment and add your accounts:
# claude-api-key:
#   - prefix: "account1"
#     cloak:
#       mode: "auto"
EOF

echo "CLIProxy stack ready at ~/docker/cliproxy/"
```

## Phase 3: Trading Docker Stack

```bash
# ~/docker/trading/compose.yml
cat > ~/docker/trading/compose.yml << 'EOF'
name: trading

services:
  timescaledb:
    image: timescale/timescaledb:latest-pg16
    container_name: trading-tsdb
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USER:-trading}
      POSTGRES_DB: ${DB_NAME:-trading}
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - tsdb-data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-trading} -d ${DB_NAME:-trading}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2"

  redis:
    image: redis:7-alpine
    container_name: trading-redis
    restart: unless-stopped
    command: >
      redis-server
      --requirepass $(cat /run/secrets/redis_password)
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
    secrets:
      - redis_password
    volumes:
      - redis-data:/data
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 10s

  langfuse:
    image: langfuse/langfuse:latest
    container_name: trading-langfuse
    profiles: ["observability"]
    restart: unless-stopped
    depends_on:
      timescaledb:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${DB_USER:-trading}:${LANGFUSE_DB_PASSWORD}@timescaledb:5432/${DB_NAME:-trading}
    ports:
      - "127.0.0.1:3000:3000"
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3000/api/public/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

networks:
  default:
    name: trading-net
    driver: bridge

volumes:
  tsdb-data:
    name: trading-tsdb-data
  redis-data:
    name: trading-redis-data

secrets:
  db_password:
    file: ./secrets/db_password.txt
  redis_password:
    file: ./secrets/redis_password.txt
EOF

# Dev override
cat > ~/docker/trading/compose.override.yml << 'EOF'
services:
  timescaledb:
    environment:
      POSTGRES_PASSWORD: devpassword
EOF

# Create secret files
echo "change-me-trading-db" > ~/docker/trading/secrets/db_password.txt
echo "change-me-redis" > ~/docker/trading/secrets/redis_password.txt
chmod 600 ~/docker/trading/secrets/*.txt

# .env for non-sensitive config
cat > ~/docker/trading/.env << 'EOF'
DB_USER=trading
DB_NAME=trading
COMPOSE_PROFILES=
EOF

echo "Trading stack ready at ~/docker/trading/"
```

## Phase 4: Launch Commands

```bash
# Start CLIProxy
cd ~/docker/cliproxy && docker compose up -d
docker compose ps    # Verify healthy

# Start Trading services
cd ~/docker/trading && docker compose up -d
docker compose ps    # Verify healthy

# Start with observability (Langfuse)
cd ~/docker/trading && docker compose --profile observability up -d

# Check all containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

## Phase 5: Add CLIProxy Accounts

```bash
# Add Claude account (opens browser for OAuth)
docker exec -it cliproxy ./CLIProxyAPI --claude-login

# Add Codex account
docker exec -it cliproxy ./CLIProxyAPI --codex-login

# Add Gemini account
docker exec -it cliproxy ./CLIProxyAPI --login

# Verify accounts loaded
curl -s http://localhost:8317/v1/models | python3 -m json.tool
```

## Phase 6: Verify from Windows

```powershell
# Test CLIProxy health from Windows
curl http://localhost:8317/v1/models

# Test TimescaleDB from Windows
psql -h localhost -U trading -d trading -c "SELECT version();"

# Test Redis from Windows
redis-cli -h localhost ping
```

## Phase 7: Config Watch (Hot Reload)

```bash
# Start CLIProxy with config watching
cd ~/docker/cliproxy && docker compose up --watch -d

# Now edit config.yaml → CLIProxy auto-restarts
# (routing changes, account additions take effect immediately)
```

## Backup Script

```bash
cat > ~/docker/scripts/backup.sh << 'SCRIPT'
#!/bin/bash
set -euo pipefail
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=~/docker/backups

# TimescaleDB (logical dump — NEVER raw volume copy)
docker exec trading-tsdb pg_dump -U trading trading \
  --format=custom --compress=9 \
  > "$BACKUP_DIR/trading-$DATE.dump"

# CLIProxy auth tokens
docker run --rm \
  -v cliproxy-auths:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/cliproxy-auths-$DATE.tar.gz" -C /data .

# Cleanup: keep 7 daily
find "$BACKUP_DIR" -name "trading-*.dump" -mtime +7 -delete
find "$BACKUP_DIR" -name "cliproxy-auths-*.tar.gz" -mtime +7 -delete

echo "Backup complete: $DATE"
SCRIPT
chmod +x ~/docker/scripts/backup.sh

# Schedule daily at 2am
(crontab -l 2>/dev/null; echo "0 2 * * * ~/docker/scripts/backup.sh >> ~/docker/logs/backup.log 2>&1") | crontab -
```

## Quick Reference

```bash
# Status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Logs
docker compose -f ~/docker/cliproxy/compose.yml logs -f
docker compose -f ~/docker/trading/compose.yml logs -f

# Restart CLIProxy (after config change without watch)
docker compose -f ~/docker/cliproxy/compose.yml restart

# Stop everything
docker compose -f ~/docker/cliproxy/compose.yml down
docker compose -f ~/docker/trading/compose.yml down

# Update images
docker compose -f ~/docker/cliproxy/compose.yml pull && docker compose -f ~/docker/cliproxy/compose.yml up -d
docker compose -f ~/docker/trading/compose.yml pull && docker compose -f ~/docker/trading/compose.yml up -d

# Backup now
~/docker/scripts/backup.sh

# Restore TimescaleDB
docker exec -i trading-tsdb pg_restore -U trading -d trading --clean < ~/docker/backups/trading-YYYYMMDD.dump

# Restore CLIProxy auths
docker run --rm -v cliproxy-auths:/data -v ~/docker/backups:/bk alpine tar xzf /bk/cliproxy-auths-YYYYMMDD.tar.gz -C /data
```
