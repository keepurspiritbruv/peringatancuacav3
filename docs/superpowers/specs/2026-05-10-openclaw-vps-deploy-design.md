# OpenClaw VPS Deployment Design

Deploy OpenClaw WhatsApp bot ke VPS via Docker. Phased approach.

## Phases

- **Phase 1 (now):** OpenClaw WhatsApp bot only. No traefik, no domain, no backend on VPS.
- **Phase 2 (later):** Backend + ML API + Frontend + Redis + PostgreSQL + Traefik + Domain.

## Phase 1: OpenClaw Bot Only

### What runs on VPS
- OpenClaw Docker container (WhatsApp bot, 24/7)
- 1 Docker volume for WhatsApp auth session persistence

### What stays local (laptop)
- disaster-backend (Hono)
- SHAP ML API
- frontend (Next.js PWA)
- Redis, PostgreSQL

### Data Flow (Phase 1)

```
Laptop (backend) ──POST /hooks/agent──► VPS (OpenClaw:3000) ──► WhatsApp groups
```

Backend on laptop sends alerts to OpenClaw on VPS via `http://<VPS_IP>:3000/hooks/agent`.

### Repo Structure

```
peringatancuacav3/
├── openclaw/
│   ├── docker-compose.yml    ← Phase 1: OpenClaw only
│   ├── Dockerfile            ← Existing OpenClaw Dockerfile
│   └── ... (full source)
├── disaster-backend/          ← Stays local for now
├── SHAP-model-api/           ← Stays local for now
├── frontend/                 ← Stays local for now
└── .env.production.example   ← Template (no real secrets)
```

### docker-compose.yml (Phase 1)

```yaml
services:
  openclaw:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - openclaw-data:/root/.openclaw
    env_file:
      - .env
    restart: unless-stopped

volumes:
  openclaw-data:
```

### Environment Variables

#### OpenClaw .env (on VPS, NOT in git)
- `OPENCLAW_GATEWAY_TOKEN` = gateway auth token
- Gateway binds `0.0.0.0` so backend on laptop can reach it

#### OpenClaw config (~/.openclaw/openclaw.json inside container volume)
- `hooks.enabled=true`
- `hooks.token` = hooks auth token (distinct from gateway token)
- `channels.whatsapp` config with auth session
- WhatsApp channel enabled, open DM + group policy

#### Backend .env.local (on laptop)
- `OPENCLAW_GATEWAY_URL=http://<VPS_IP>:3000`
- `OPENCLAW_HOOK_TOKEN` = same hooks token
- `OPENCLAW_BROADCAST_GROUPS` = WhatsApp group JIDs

### Persistent Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `openclaw-data` | `/root/.openclaw` | WhatsApp auth session, config, memory |

WhatsApp auth session persists across container restarts. If volume lost, must re-scan QR.

### Security (Phase 1)

- OpenClaw port 3000 exposed to internet (needed so laptop backend can reach it)
- Gateway token + hooks token protect the endpoints
- No domain/TLS in Phase 1 (HTTP only) — acceptable for internal bot traffic
- `.env` never committed to git

### Deployment Steps (Phase 1)

1. Copy OpenClaw source to `peringatancuacav3/openclaw/`
2. Push to GitHub
3. On VPS: `git clone https://github.com/keepurspiritbruv/peringatancuacav3.git`
4. On VPS: `cd peringatancuacav3/openclaw && cp .env.example .env` and fill in secrets
5. On VPS: `docker compose up -d --build`
6. On VPS: `docker compose exec openclaw openclaw channels login --channel whatsapp` (scan QR)
7. On VPS: `docker compose exec openclaw openclaw doctor` (verify health)
8. On laptop: Update backend `.env.local` with `OPENCLAW_GATEWAY_URL=http://<VPS_IP>:3000`

### Managing Config After Deploy

Edit config from laptop via SCP:
```bash
# Copy config to VPS
scp ~/.openclaw/openclaw.json user@<VPS_IP>:/root/.openclaw/openclaw.json

# Restart OpenClaw to pick up changes
ssh user@<VPS_IP> "cd peringatancuacav3/openclaw && docker compose restart openclaw"
```

Or edit directly on VPS via SSH:
```bash
ssh user@<VPS_IP>
docker compose exec openclaw openclaw config edit
```

## Phase 2: Full Stack (Future)

Backend, ML API, Frontend, Redis, PostgreSQL deployed to VPS with Traefik reverse proxy and domain. OpenClaw joins Traefik network for internal-only communication. Spec TBD when Phase 2 is needed.

## Prerequisites on VPS

- Docker Engine 24+
- Docker Compose V2
- Git
- Phase 1: 1 vCPU, 1GB RAM minimum (OpenClaw only is lightweight)
- Phase 2: 4 vCPU, 8GB RAM recommended
