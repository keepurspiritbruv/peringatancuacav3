# OpenClaw VPS Deployment Design

Deploy monorepo peringatancuacav3 (OpenClaw + backend + ML + frontend) ke VPS via Docker Compose.

## Repo Structure

```
peringatancuacav3/
├── openclaw/              ← OpenClaw source (full copy, no .git)
├── disaster-backend/      ← Hono + Redis backend (existing)
├── SHAP-model-api/        ← Python ML API (existing)
├── frontend/              ← Next.js PWA (existing, submodule)
├── docker-compose.yml     ← Root Docker Compose orchestrator
├── .env.production        ← Shared env vars for VPS
└── deploy/
    └── deploy.sh          ← One-command deploy script
```

## Docker Compose Services

| Service | Build Context | Port | Exposed | Depends On |
|---------|--------------|------|---------|------------|
| `openclaw` | `./openclaw` | 3000 | No (internal only) | - |
| `backend` | `./disaster-backend` | 3000 | Yes | redis, postgres, ml-api, openclaw |
| `ml-api` | `./SHAP-model-api` | 8000 | No (internal only) | - |
| `frontend` | `./frontend` | 3001 | Yes | backend |
| `redis` | `redis:7-alpine` | 6379 | No | - |
| `postgres` | `postgres:16-alpine` | 5432 | No | - |

## Network

Single Docker network `peringatan-net`. All services communicate via service names:
- Backend reaches OpenClaw at `http://openclaw:3000`
- Backend reaches ML API at `http://ml-api:8000`
- Backend reaches Redis at `redis:6379`
- Backend reaches PostgreSQL at `postgres:5432`
- Frontend reaches Backend at `http://backend:3000`

## Data Flow

```
Nelayan (WhatsApp) ←→ OpenClaw (internal:3000)
                         ↑
Backend (public:3000) ← /hooks/agent POST
    ↓
Redis (queue/cache) + PostgreSQL (persistence)
    ↓
ML API (internal:8000) ← SHAP prediction requests
    ↑
Frontend (public:3001) → Backend API calls
```

## Environment Variables

### Backend (.env.production)
- `OPENCLAW_GATEWAY_URL=http://openclaw:3000` (Docker internal)
- `OPENCLAW_HOOK_TOKEN` = hooks token from openclaw.json
- `OPENCLAW_BROADCAST_GROUPS` = WhatsApp group JIDs
- `REDIS_URL=redis://redis:6379`
- `DATABASE_URL=postgres://user:pass@postgres:5432/disaster_db`
- `ML_BASE_URL=http://ml-api:8000`

### OpenClaw (~/.openclaw/openclaw.json inside container)
- `hooks.enabled=true`
- `hooks.token` = same as OPENCLAW_HOOK_TOKEN
- WhatsApp channel config with auth session

## Persistent Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `openclaw-data` | `~/.openclaw` | WhatsApp auth session, config, memory |
| `redis-data` | `/data` | Redis persistence |
| `postgres-data` | `/var/lib/postgresql/data` | Database persistence |

## Security

- OpenClaw gateway: internal only, no public port
- ML API: internal only
- Redis/PostgreSQL: internal only
- Backend: public with JWT auth (existing)
- Frontend: public
- Gateway token + hooks token distinct and strong
- `.env.production` not committed to git (use `.env.production.example`)

## Deployment Steps

1. `git clone https://github.com/keepurspiritbruv/peringatancuacav3.git`
2. `cp .env.production.example .env.production` and fill in secrets
3. `docker compose up -d --build`
4. `docker compose exec openclaw openclaw channels login --channel whatsapp` (scan QR)
5. `docker compose exec openclaw openclaw doctor` (verify health)

## WhatsApp Session Persistence

WhatsApp auth session stored in `openclaw-data` volume. After first QR scan, session persists across container restarts. If volume is lost, must re-scan QR.

## Prerequisites on VPS

- Docker Engine 24+
- Docker Compose V2
- Git
- 4 vCPU, 8GB RAM recommended
