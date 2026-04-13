# AgentFlow AI — Deployment Guide

## Prerequisites

- Docker Desktop (v24+)
- Node.js 20+ (for local dev)
- API keys: Google Gemini (AI Studio), YouTube Data API v3, SerpAPI

---

## 1. Local Development (Docker Compose)

```bash
# 1. Clone and enter the project
cd "AgentFlow AI"

# 2. Copy and fill all env files
cp .env.example .env
cp backend/api-gateway/.env.example         backend/api-gateway/.env
cp backend/orchestrator/.env.example        backend/orchestrator/.env
cp backend/researcher-agent/.env.example    backend/researcher-agent/.env
cp backend/crawler-agent/.env.example       backend/crawler-agent/.env
cp backend/critic-agent/.env.example        backend/critic-agent/.env
cp frontend/.env.example                    frontend/.env

# Edit each .env and fill in real API keys

# 3. Start everything
docker-compose up --build

# 4. Open frontend
open http://localhost:5173

# 5. Open API docs (dev only)
open http://localhost:3000/docs
```

---

## 2. Git Branching Strategy

```
main          ← production releases only (protected)
dev           ← integration branch (all PRs merge here first)
  ├── feature/researcher-agent
  ├── feature/crawler-agent
  ├── feature/critic-agent
  ├── feature/frontend-search-ui
  └── fix/...
```

### Rules
- Never commit directly to `main`
- All new work branches off `dev`
- PRs require at least one review
- Branch naming: `feature/<scope>`, `fix/<scope>`, `chore/<scope>`

```bash
# Start a feature
git checkout dev
git pull origin dev
git checkout -b feature/crawler-agent

# Done? Open PR to dev
git push origin feature/crawler-agent
```

---

## 3. Production Deployment (Railway)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and initialise
railway login
railway init

# Create a project for each service
railway up --service api-gateway
railway up --service researcher-agent
railway up --service crawler-agent
railway up --service critic-agent
railway up --service orchestrator

# Link shared Redis and Postgres plugins from Railway dashboard
```

Environment variables are set per service in the Railway dashboard. Never commit `.env` files.

---

## 4. Scaling

### Scale Crawler Agent (most I/O intensive)
```yaml
# docker-compose.yml
crawler-agent:
  deploy:
    replicas: 4
```

### Scale via BullMQ worker concurrency
Each worker's concurrency is controlled via the `concurrency` option in `createWorker()`.

---

## 5. Monitoring

Each service logs structured JSON via Pino. Pipe logs to any aggregator:

```bash
# Docker log streaming
docker-compose logs -f researcher-agent

# Ship to Datadog / Loki / CloudWatch
# Recommended: deploy a Loki + Grafana sidecar or use Railway's built-in logging
```

---

## 6. Security Checklist

- [ ] Rotate `API_SECRET_KEY` before production
- [ ] Set `REDIS_PASSWORD` in production
- [ ] Use strong `POSTGRES_PASSWORD`
- [ ] Restrict `CORS_ORIGINS` to your production domain
- [ ] Rate limiting is on by default (100 req/min)
- [ ] `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `SERPAPI_KEY` stored in .env files only (gitignored)
- [ ] All API keys stored as environment variables, never hardcoded
