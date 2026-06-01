# Refactor Deployment Checklist

Go-live checklist for shipping the production-refactored backend (research
infrastructure removed) and the matching app release. Work top to bottom.

Context: fresh DigitalOcean droplet, no data to migrate. Backend already builds
and runs in Docker (verified: all migrations apply, `/health` probes DB+Redis,
research routes return 404, `DELETE /users/me` is wired). See
[PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) and [CHANGELOG.md](../CHANGELOG.md).

---

## Phase 0 — Rotate leaked secrets (do first)

These appeared in plaintext during development and must be rotated before going
live:

- [ ] **Firebase Admin private key** — regenerate the service account key in
      Firebase Console → Project Settings → Service accounts; update
      `FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL` (or
      `FIREBASE_SERVICE_ACCOUNT_JSON`).
- [ ] **Expo access token** — revoke + reissue at expo.dev; update
      `EXPO_ACCESS_TOKEN`.
- [ ] **Google OAuth client secret** — rotate in Google Cloud Console; update
      `GOOGLE_CLIENT_SECRET`.
- [ ] **Postgres password** — already set to a strong value locally in
      `backend/.env`; use a fresh strong value on the droplet (see Phase 1).

> The frontend Firebase `AIza…` API key does **not** need rotation — it is
> SHA/package-restricted and ships inside the APK by design.

---

## Phase 1 — Local smoke test (before touching the droplet)

Verify the full data path end-to-end on your machine first.

- [ ] Start infra + API: `cd backend && docker compose up -d --build`
- [ ] Confirm health: `curl -s localhost:3000/health | jq`
      → `{"status":"ok","checks":{"database":"up","redis":"up"}}`
- [ ] Point the app at the local backend in the **frontend** `.env`:
      - emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`
      - physical device on LAN: `EXPO_PUBLIC_API_URL=http://<computer-LAN-IP>:3000`
- [ ] Build a dev client and run the app; sign in with Firebase.
- [ ] Do a short walk, change a setting, let a nudge fire.
- [ ] Confirm rows landed (see [Data-flow verification](#data-flow-verification)).
- [ ] Tear down when done: `docker compose down` (keep volume) or `-v` (wipe).

> Reminder: `EXPO_PUBLIC_*` is baked in at **build time**. Changing `.env`
> requires a rebuild — an already-installed build keeps its old URL.

---

## Phase 2 — Provision the droplet

- [ ] SSH in; install Docker + Docker Compose if needed.
- [ ] Clone the repo (or copy `backend/`).
- [ ] Create `backend/.env` on the droplet with production values:
  - [ ] `NODE_ENV=production`
  - [ ] `POSTGRES_PASSWORD=` strong random (e.g. `openssl rand -hex 24`)
  - [ ] `DATABASE_URL` — leave the compose default; compose builds it from
        `POSTGRES_PASSWORD` and the `postgres` service host.
  - [ ] `REDIS_URL=redis://redis:6379`
  - [ ] Firebase Admin creds (rotated, Phase 0)
  - [ ] `EXPO_ACCESS_TOKEN` (rotated)
  - [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (rotated)
  - [ ] `CORS_ORIGIN=` the droplet's public HTTPS origin (only matters for
        browser clients; native app is unaffected)
  - [ ] `SWAGGER_ENABLED=false`
  - [ ] `NUDGE_GENERATION_BATCH_SIZE=500` (or tune for user count)
- [ ] Bring it up: `docker compose up -d --build`
- [ ] Confirm migrations applied: `docker compose logs prisma-migrate`
      → should list `0001` … `0006_remove_research` + "successfully applied".
- [ ] Confirm API booted: `docker compose logs api | tail` → "GapWalk API running".

---

## Phase 3 — TLS / HTTPS (mandatory)

Release/preview Android builds block cleartext `http://`, so the backend must be
HTTPS before the app can talk to it.

- [ ] Front the API with a reverse proxy doing TLS (Caddy auto-TLS, or your
      existing `*.sslip.io` setup).
- [ ] Verify cert: `curl -sS https://<droplet-domain>/health | jq` returns 200.
- [ ] Confirm the proxy forwards `X-Forwarded-*` (the app already trusts 1 hop).

---

## Phase 4 — Data-flow verification

With the droplet up (or locally in Phase 1), confirm endpoints behave:

```bash
BASE=https://<droplet-domain>        # or http://localhost:3000 locally

curl -s $BASE/health | jq                                   # 200 ok, db+redis up
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/researcher/studies   # expect 404 (removed)
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE $BASE/api/users/me    # expect 401 (exists, auth-gated)
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/sync           # expect 401
```

After a real app session, confirm data persisted (inside the postgres container).
These are the tables the **current shipped app actually populates** — via
`POST /api/sync` (most) and `POST /api/devices` (devices):

```bash
docker compose exec postgres psql -U gapwalk -d gapwalk -c "
SELECT 'devices', count(*) FROM devices
UNION ALL SELECT 'walk_sessions', count(*) FROM walk_sessions
UNION ALL SELECT 'walk_route_points', count(*) FROM walk_route_points
UNION ALL SELECT 'walk_pause_events', count(*) FROM walk_pause_events
UNION ALL SELECT 'nudge_plans', count(*) FROM nudge_plans
UNION ALL SELECT 'analytics_events', count(*) FROM analytics_events
UNION ALL SELECT 'busy_events', count(*) FROM busy_events
UNION ALL SELECT 'crash_reports', count(*) FROM crash_reports;"
```

- [ ] Counts > 0 for the tables you exercised.
- [ ] **User behavior lands in `analytics_events`**, not `behavior_logs`. The app
      syncs interaction events by name — e.g. `nudge_scheduled`, `nudge_tapped`,
      `nudge_swiped_away`, `nudge_action_skip`, `notification_opened`,
      `walk_ready_prompt_start`, `walk_ready_not_now`, `walk_completed`,
      `walk_missed`. Inspect the funnel:
      ```bash
      docker compose exec postgres psql -U gapwalk -d gapwalk -c \
        "SELECT name, count(*) FROM analytics_events GROUP BY name ORDER BY 2 DESC;"
      ```
      The nudge lifecycle is also visible in `nudge_plans.status`
      (planned → notified → started → completed/skipped).
- [ ] `DELETE /api/users/me` with a valid token returns 204 and wipes that
      user's rows (GDPR — confirm before claiming deletion in Play Store).

> **Tables that stay empty with the current app:** `behavior_logs`,
> `app_sessions`, `user_achievements`. The backend supports them (DTOs +
> endpoints exist), but today's app build does not send them — it reports
> behavior as `analytics_events` instead. They would only populate if a future
> app build adds them to the sync payload. `daily_aggregations` /
> `weekly_aggregations` are filled by the aggregation worker (02:00 / Mon 03:00
> UTC), not by sync.

---

## Phase 5 — Frontend release build

- [ ] In the frontend `.env`, set the **final** values:
  - [ ] `EXPO_PUBLIC_API_URL=https://<droplet-domain>`
  - [ ] `GOOGLE_MAPS_API_KEY` + `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (Maps SDK key)
  - [ ] Firebase block already filled from `google-services.json`
- [ ] `google-services.json` present in root (auto-fills Firebase on Android).
- [ ] Build the release artifact (EAS) — this build embeds the droplet URL.
- [ ] Install the release build and re-run [Phase 4](#data-flow-verification)
      against the droplet to confirm the production path works.

---

## Phase 6 — Play Store release

- [ ] **Data Safety form** updated to the leaner footprint: precise **location**
      (GPS routes), app activity/analytics, crash logs — and "users can request
      deletion" (now true via `DELETE /api/users/me`).
- [ ] `docs/privacy.html` updated to match (drop any research/study language).
- [ ] Version bump (`app.config.js` / `app.json`).
- [ ] Upload, confirm signing SHA-1 is registered in the same Firebase project
      as `google-services.json` (otherwise Google sign-in fails on the release).
- [ ] Submit for review.

---

## Post-release watch

- [ ] Monitor `/health` (uptime check) — 503 means DB or Redis is down.
- [ ] Tail `docker compose logs -f api`; use the `X-Request-ID` in error bodies
      to trace user-reported issues.
- [ ] Confirm the daily nudge job runs at 06:00 UTC and the per-minute push job
      dispatches (worker logs).
- [ ] Set up DB backups (the droplet is the source of truth for synced users).
