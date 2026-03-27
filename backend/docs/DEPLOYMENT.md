# GapWalk Backend - Production Deployment Guide

> Step-by-step instructions for deploying the GapWalk backend to production.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Configuration](#2-environment-configuration)
3. [Deployment Options](#3-deployment-options)
4. [Docker Compose (Recommended)](#4-docker-compose-recommended)
5. [Manual Deployment](#5-manual-deployment)
6. [Cloud Platform Guides](#6-cloud-platform-guides)
7. [Database Setup](#7-database-setup)
8. [SSL / TLS Configuration](#8-ssl--tls-configuration)
9. [Monitoring & Health Checks](#9-monitoring--health-checks)
10. [Security Checklist](#10-security-checklist)
11. [Scaling Considerations](#11-scaling-considerations)
12. [Backup & Recovery](#12-backup--recovery)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 20 LTS or 22 LTS | Required for `npm run start:prod` |
| **PostgreSQL** | 16+ | Primary database |
| **Redis** | 7+ | BullMQ job queue backend |
| **Firebase project** | - | With Authentication enabled and Admin credentials available |
| **Expo access token** | - | For push notifications |
| **Docker** (optional) | 24+ | For containerized deployment |

---

## 2. Environment Configuration

### Required Environment Variables

```bash
# Database - use SSL in production
DATABASE_URL=postgresql://user:password@host:5432/gapwalk?sslmode=require

# Redis - use TLS if using managed Redis
REDIS_URL=redis://host:6379
# or: REDIS_URL=rediss://host:6380 (TLS)

# Firebase Admin
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Expo Push
EXPO_ACCESS_TOKEN=your_expo_access_token

# App
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://your-app-domain.com
ENABLE_WORKERS=true
```

### Security Rules for Production Variables

- **POSTGRES_PASSWORD**: Generate with `openssl rand -base64 32` - minimum 32 characters
- **FIREBASE_PRIVATE_KEY**: Obtained from your Firebase service account JSON
- **EXPO_ACCESS_TOKEN**: Generated at https://expo.dev/accounts/[your-account]/settings/access-tokens
- **Never commit** `.env` to version control (already in `.gitignore`)
- **Rotate all secrets** before the first production deployment if they were ever used in development

---

## 3. Deployment Options

| Option | Best For | Complexity |
|---|---|---|
| **Docker Compose** | Single VPS, small teams | Low |
| **Railway / Render** | Quick PaaS deployment | Low |
| **AWS ECS / Fargate** | Scalable cloud deployment | Medium |
| **Kubernetes** | Large-scale, multi-region | High |
| **Manual (PM2)** | Existing server infrastructure | Medium |

---

## 4. Docker Compose (Recommended)

### Step 1: Prepare the server

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Clone the repository
git clone <your-repo-url>
cd GapWalk/backend
```

### Step 2: Configure environment

```bash
cp .env.example .env
# Edit .env with production values
nano .env
```

### Step 3: Deploy

```bash
# Build and start all services
docker compose up -d --build

# Verify all services are healthy
docker compose ps

# Check API logs
docker compose logs -f api
```

### Step 4: Verify deployment

```bash
# Health check
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"..."}

# Swagger docs
curl -s http://localhost:3000/docs | head -5
```

### Service Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PostgreSQL    │     │     Redis       │     │   API Server    │
│   :5432         │◄────│   :6379         │◄────│   :3000         │
│   (persistent)  │     │   (persistent)  │     │   (auto-restart)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
        ▲                                              │
        │                                              │
┌───────┴─────────┐                             ┌──────┴──────────┐
│  Prisma Migrate │                             │   Dashboard     │
│  (init → exit)  │                             │  /dashboard     │
└─────────────────┘                             └─────────────────┘
```

### Startup Order

1. **PostgreSQL** starts and becomes healthy
2. **Redis** starts and becomes healthy
3. **prisma-migrate** runs `prisma migrate deploy`, applies any pending migrations, then exits
4. **api** starts only after postgres, redis, and migrations are complete

---

## 5. Manual Deployment

If you prefer running without Docker:

```bash
# 1. Install dependencies
npm ci --production=false

# 2. Generate Prisma client
npx prisma generate

# 3. Run database migrations
npx prisma migrate deploy

# 4. Build
npm run build

# 5. Start with PM2 (recommended for production)
npm install -g pm2
pm2 start dist/main.js --name gapwalk-api \
  --max-memory-restart 512M \
  --instances 1 \
  --env production

# 6. Save PM2 config for auto-restart
pm2 save
pm2 startup
```

### PM2 Ecosystem File (Alternative)

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'gapwalk-api',
    script: 'dist/main.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '512M',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
};
```

---

## 6. Cloud Platform Guides

### Railway

1. Connect your GitHub repository
2. Set the root directory to `backend`
3. Add environment variables in Railway dashboard
4. Add PostgreSQL and Redis add-ons
5. Build command: `npm run build && npx prisma migrate deploy`
6. Start command: `npm run start:prod`

### Render

1. Create a new Web Service from your repo
2. Set root directory: `backend`
3. Build command: `npm ci && npx prisma generate && npm run build`
4. Start command: `npx prisma migrate deploy && npm run start:prod`
5. Add PostgreSQL database and Redis from Render dashboard
6. Set environment variables

### AWS ECS / Fargate

1. Build Docker image: `docker build -t gapwalk-api .`
2. Push to ECR: `docker push <ecr-uri>/gapwalk-api:latest`
3. Create ECS task definition with:
   - Container image: `<ecr-uri>/gapwalk-api:latest`
   - Port mapping: 3000
   - Health check: `CMD wget -qO- http://localhost:3000/health || exit 1`
4. Use RDS for PostgreSQL and ElastiCache for Redis
5. Set environment variables via ECS task definition or AWS Secrets Manager

---

## 7. Database Setup

### Initial Migration

```bash
# Apply all pending migrations
npx prisma migrate deploy
```

### Schema Overview

The database has **23 models** across 5 domains and **11 enums**. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full schema breakdown.

### Connection Pooling

For production with multiple connections, consider using:
- **PgBouncer** for connection pooling
- Append `?pgbouncer=true&connection_limit=10` to `DATABASE_URL`

### Recommended PostgreSQL Settings

```sql
-- For a server with 4GB RAM
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB
max_connections = 100
```

---

## 8. SSL / TLS Configuration

### Database SSL

Add `?sslmode=require` to your `DATABASE_URL`:

```
DATABASE_URL=postgresql://user:pass@host:5432/gapwalk?sslmode=require
```

### Redis TLS

Use `rediss://` protocol for TLS Redis connections:

```
REDIS_URL=rediss://host:6380
```

### Reverse Proxy (Nginx)

Place the API behind a reverse proxy for SSL termination:

```nginx
server {
    listen 443 ssl http2;
    server_name api.gapwalk.com;

    ssl_certificate     /etc/ssl/certs/gapwalk.crt;
    ssl_certificate_key /etc/ssl/private/gapwalk.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:3000/health;
    }
}
```

---

## 9. Monitoring & Health Checks

### Health Check Endpoint

```
GET /health
Response: { "status": "ok", "timestamp": "2026-03-03T12:00:00.000Z" }
```

Use this for:
- Docker `HEALTHCHECK`
- Load balancer health checks
- Uptime monitoring (UptimeRobot, Pingdom, etc.)

### What to Monitor

| Metric | How | Alert Threshold |
|---|---|---|
| **API response time** | Reverse proxy logs, APM | > 2 seconds |
| **Error rate** | Application logs | > 1% of requests |
| **Database connections** | `pg_stat_activity` | > 80% of max_connections |
| **Redis memory** | `redis-cli info memory` | > 80% of maxmemory |
| **Queue depth** | BullMQ dashboard or logs | > 100 pending jobs |
| **Push delivery rate** | PushLog table queries | Delivered rate < 90% |
| **Disk space** | System monitoring | > 85% usage |

### Log Monitoring

In production, the server logs at `error`, `warn`, and `log` levels. Key log lines to watch:

```
[Bootstrap] GapWalk API running on port 3000
[NudgeGenerationProcessor] Nudge generation complete: 50 ok, 0 failed
[PushSendProcessor] Found 12 due nudge plans to send
[AggregationProcessor] Daily aggregation done: 50/50
[ReceiptCheckProcessor] Receipt check complete: {"checked":15}
```

---

## 10. Security Checklist

Before going to production, verify each item:

- [ ] **`.env` not in git** - Already in `.gitignore`, verify with `git ls-files .env`
- [ ] **Strong database password** - Minimum 32 characters, randomly generated
- [ ] **All secrets rotated** - Don't reuse development Firebase/Expo credentials
- [ ] **`NODE_ENV=production`** - Set in environment (reduces verbose logging)
- [ ] **`CORS_ORIGIN` set correctly** - Only allow your app's domain, not `*`
- [ ] **SSL on database** - `?sslmode=require` in `DATABASE_URL`
- [ ] **Reverse proxy with HTTPS** - Never expose port 3000 directly to the internet
- [ ] **Non-root Docker user** - Dockerfile already creates and uses `appuser`
- [ ] **Rate limiting configured** - Consider adding `@nestjs/throttler` for API rate limits
- [ ] **Firebase Authentication configured** - Ensure Google and email/password providers are enabled
- [ ] **Expo access token scoped** - Use project-scoped tokens when possible
- [ ] **Database backups enabled** - Automated daily backups with point-in-time recovery
- [ ] **Firewall rules** - Only expose port 443 (HTTPS) externally

---

## 11. Scaling Considerations

### Current Architecture (Single Server)

The current setup runs all components on a single server:
- NestJS API (handles HTTP requests)
- BullMQ workers (background job processing)
- PostgreSQL (database)
- Redis (job queue)

This is suitable for **up to ~500 active users**.

### Horizontal Scaling

For larger deployments:

| Component | Scaling Strategy |
|---|---|
| **API** | Run multiple instances behind a load balancer (stateless) |
| **Workers** | Set `ENABLE_WORKERS=false` on API instances, run dedicated worker process |
| **PostgreSQL** | Use managed database (RDS, Cloud SQL) with read replicas |
| **Redis** | Use managed Redis (ElastiCache, Redis Cloud) |

### Separating API and Workers

```bash
# API instances (no workers)
ENABLE_WORKERS=false npm run start:prod

# Worker instance (no HTTP server needed, but currently bundled)
ENABLE_WORKERS=true npm run start:prod
```

### Performance Bottlenecks to Watch

1. **Nudge generation** runs sequentially per user - at 1000+ users, consider parallelizing
2. **Route points** are high-volume (~720 rows per 1-hour walk) - consider archiving old data
3. **Push send** processes plans sequentially - batch processing can improve throughput
4. **Sync endpoint** does many sequential DB operations - could benefit from transactions

---

## 12. Backup & Recovery

### PostgreSQL Backups

```bash
# Manual backup
docker compose exec postgres pg_dump -U gapwalk gapwalk > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -i postgres psql -U gapwalk gapwalk < backup_20260303.sql
```

### Automated Backups

Set up a cron job on the server:

```bash
# Daily backup at 4 AM, keep 30 days
0 4 * * * docker compose exec -T postgres pg_dump -U gapwalk gapwalk | gzip > /backups/gapwalk_$(date +\%Y\%m\%d).sql.gz && find /backups -name "*.sql.gz" -mtime +30 -delete
```

### Redis Persistence

Redis is configured with AOF persistence via the Docker volume. For production, consider:
- `appendonly yes` for write durability
- `save 900 1` for periodic snapshots

---

## 13. Troubleshooting

### API Won't Start

```bash
# Check logs
docker compose logs api

# Common issues:
# - DATABASE_URL not set or unreachable
# - Redis not accessible
# - Prisma client not generated (run prisma generate)
# - Port 3000 already in use
```

### Migrations Failed

```bash
# Check migration status
npx prisma migrate status

# If stuck, reset (WARNING: deletes all data)
npx prisma migrate reset

# Apply pending migrations
npx prisma migrate deploy
```

### Push Notifications Not Sending

1. Check `EXPO_ACCESS_TOKEN` is valid
2. Verify devices have valid Expo push tokens: `GET /api/devices`
3. Check push logs: query `push_logs` table for errors
4. Verify `ENABLE_WORKERS=true` - workers must be running
5. Check Redis is healthy: `redis-cli ping`

### Workers Not Running

```bash
# Check if workers are enabled
echo $ENABLE_WORKERS  # should be 'true' or unset

# Check BullMQ connection to Redis
docker compose logs api | grep -i "scheduled\|worker\|bull"
```

### High Memory Usage

- Restart the API: `docker compose restart api`
- Check for long-running queries: `SELECT * FROM pg_stat_activity WHERE state = 'active';`
- Monitor Redis memory: `docker compose exec redis redis-cli info memory`
