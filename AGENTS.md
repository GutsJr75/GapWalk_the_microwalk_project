# AGENTS.md

Guidance for AI agents and contributors working in the **GapWalk** repository.
Read this before making changes. It captures the conventions, hard rules, and
gotchas that are not obvious from the code alone.

---

## What this repo is

GapWalk is a **published, offline-first micro-walk Android app** plus an optional
cloud backend. It is a monorepo with two independently buildable parts:

| Path        | What it is                              | Stack |
| ----------- | --------------------------------------- | ----- |
| `/` (root)  | React Native / Expo mobile app          | Expo ~54, React Native 0.81, TypeScript ~5.9, Zustand, expo-sqlite |
| `/backend`  | Optional cloud API (sync, nudges, push) | NestJS 11, TypeScript 5.7, Prisma 7 / PostgreSQL 16, Redis 7 + BullMQ, Firebase Auth, Expo Server SDK |

The app works **fully offline**. The backend is an opt-in layer for cross-device
sync, server-side nudge generation, and push delivery. The app is live in the
Play Store — **there are real users**.

---

## Repository layout

```
GapWalk/
├── App.tsx, index.js          # Expo app entry
├── src/                       # Mobile app source
│   ├── screens/ services/ store/ lib/ ...
│   └── services/gapEngine.ts  # On-device gap algorithm (mirrors the backend one)
├── e2e/maestro/               # Maestro end-to-end flows
├── docs/                      # Project-level docs (build, notifications, release, diagrams)
├── backend/                   # NestJS cloud backend (see backend/README.md)
│   ├── src/                   # Feature modules (auth, users, nudge-engine, sync, workers, health, ...)
│   ├── prisma/                # schema.prisma + forward-only migrations
│   └── docs/                  # Backend docs (API, architecture, deployment, audit, user guide)
└── AGENTS.md                  # This file
```

---

## Setup & common commands

### Mobile app (root)

```bash
npm install            # runs setup-check.js preinstall
npm start              # Expo dev server
npm run android        # build & launch on Android (scripts/run-android.js)
npm run e2e:maestro:all # run all Maestro e2e flows (needs a device/emulator)
```

### Backend (`/backend`)

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy   # apply migrations (fresh DB or new ones)
npm run start:dev           # hot-reload dev server
npm run build               # tsc / nest build — use this to verify changes compile
npm test                    # unit tests (jest)
npm run test:e2e            # e2e tests (needs Postgres + Redis)
npm run lint                # eslint --fix
```

Infrastructure for local backend dev:

```bash
cd backend && docker compose up -d postgres redis
```

> **Toolchain note:** some sandboxes have **no Node and no Docker** installed. If
> you cannot run `npm`/`tsc`/`docker`, say so explicitly and fall back to careful
> static review + `grep` verification rather than claiming something was tested.

---

## Hard rules (do not violate)

1. **Never break shipped API contracts.** The published app calls specific
   endpoints — at minimum `PATCH /api/users/me`, `POST /api/sync`,
   `POST /api/devices`, `POST /api/devices/heartbeat`,
   `POST /api/nudge-plans/local-delivery`. Do not change existing paths or
   request/response shapes. **Adding** new endpoints is fine.
2. **Never commit secrets.** `backend/.env` holds real Firebase/Expo/Google
   credentials and is gitignored — keep it that way. Only `.env.example` files
   are tracked. If you touch env, update `.env.example` and the docs too.
3. **Do not change the GapEngine algorithm logic.** It is mirrored in
   `src/services/gapEngine.ts` (device) and
   `backend/src/nudge-engine/nudge-engine.service.ts` (server). Keep them in
   behavioral sync; only refactor for clarity or remove dead/legacy fields.
4. **Migrations are forward-only.** Add a new timestamped Prisma migration under
   `backend/prisma/migrations/`; never edit an existing one.
5. **No `console.*` in the backend.** Use the NestJS `Logger` with a per-class
   context label. (The backend currently has zero `console.*` — keep it that way.)
6. **Roles are server-managed.** `UserRole` is `user | admin`. Never expose
   `role` on a client-writable DTO (prevents privilege escalation).

---

## Conventions

- **TypeScript everywhere.** Match the surrounding file's style; backend DTOs use
  `class-validator` decorators and `@nestjs/swagger` annotations.
- **Validation:** global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`.
  Unknown body fields are rejected — keep DTOs complete.
- **Env validation:** backend env is validated at startup in
  `backend/src/config/env.validation.ts`; add new required vars there.
- **Errors carry an `X-Request-ID`** (request-id middleware) — include it when
  diagnosing support issues.
- **Auth:** every backend endpoint except `GET /health` requires a Firebase JWT.
- **Data access:** Prisma only; no raw SQL string interpolation.

---

## Testing & verification

- Backend: `npm run build` (compile check) → `npm test` → `npm run test:e2e`
  (the e2e suite needs Postgres + Redis; set `PRISMA_CONNECT_IN_TEST=true`).
- App: Maestro flows in `e2e/maestro/` require a connected device/emulator.
- When you cannot run anything, verify with `grep` for dangling symbols and
  re-read changed files; report exactly what you could and could not run.

---

## Recent production refactor (May 2026)

The backend was converted from a research-grade data-collection system into a
clean production API. **All research infrastructure was removed**: the
`researcher/` and `dashboard-spa/` modules, the `Study` / `StudyEnrollment` /
`ResearcherAction` models, `UserProfile` research fields, and the `researcher`
role (collapsed to `user | admin`) — see migration `0006_remove_research`.
Added: GDPR account deletion (`DELETE /api/users/me`), cursor-batched nudge
generation, request-id middleware, DB+Redis health checks, startup env
validation, per-route rate limits, and graceful worker shutdown. Full detail in
[backend/docs/PRODUCTION_AUDIT.md](backend/docs/PRODUCTION_AUDIT.md).

If you find lingering "research"/"study"/"researcher dashboard" references in
code or docs, they are stale — remove or correct them.

---

## Where documentation lives

| Doc | Scope |
| --- | ----- |
| [README.md](README.md) | Whole project: app + backend overview |
| [docs/](docs/) | App build/env guide, notifications report, release checklist, diagrams |
| [backend/README.md](backend/README.md) | Backend quick start, env vars, structure |
| [backend/docs/API_REFERENCE.md](backend/docs/API_REFERENCE.md) | Every REST endpoint |
| [backend/docs/ARCHITECTURE.md](backend/docs/ARCHITECTURE.md) | Modules, data model, algorithms |
| [backend/docs/DEPLOYMENT.md](backend/docs/DEPLOYMENT.md) | Production deployment |
| [backend/docs/USER_GUIDE.md](backend/docs/USER_GUIDE.md) | Features, privacy, account deletion |
| [backend/docs/PRODUCTION_AUDIT.md](backend/docs/PRODUCTION_AUDIT.md) | Readiness audit + refactor log |

**When you change behavior, update the matching doc in the same change.** Keep
the API reference and the schema model count in sync with the code.
