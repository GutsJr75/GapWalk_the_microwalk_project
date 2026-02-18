# Quick Summary: main vs nestjs Branch Differences

## TL;DR

The `nestjs` branch adds a **complete backend API server** to the project. The `main` branch only has the mobile app.

## Visual Comparison

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│        MAIN BRANCH              │     │       NESTJS BRANCH             │
├─────────────────────────────────┤     ├─────────────────────────────────┤
│                                 │     │                                 │
│  📱 Mobile App (Expo)           │     │  📱 Mobile App (Expo)           │
│     - React Native              │     │     - React Native              │
│     - TypeScript                │     │     - TypeScript                │
│     - Local SQLite              │     │     - Local SQLite              │
│     - Offline-first             │     │     - Offline-first             │
│                                 │     │                                 │
│  ❌ No backend                  │     │  ✅ BACKEND SERVER (NEW!)       │
│                                 │     │     - NestJS API                │
│                                 │     │     - PostgreSQL Database       │
│                                 │     │     - Redis Queue               │
│                                 │     │     - Auth0 Integration         │
│                                 │     │     - Background Workers        │
│                                 │     │     - Push Notifications        │
│                                 │     │     - Researcher Dashboard      │
│                                 │     │     - Analytics Engine          │
│                                 │     │                                 │
└─────────────────────────────────┘     └─────────────────────────────────┘
```

## Key Statistics

| Metric | Main Branch | NestJS Branch | Difference |
|--------|-------------|---------------|------------|
| **Total Files** | N/A | +102 files | +102 new backend files |
| **Lines of Code** | N/A | +19,513 lines | All backend code |
| **Commits Ahead** | 0 | 1 | "Backend Implementation Successful" |
| **Backend Modules** | 0 | 18 modules | Complete API |
| **Database Models** | 0 | 16 models | Full Prisma schema |
| **API Endpoints** | 0 | 50+ endpoints | RESTful API |
| **Background Workers** | 0 | 4 workers | Job processing |

## What's Added in nestjs Branch

### 🏗️ Infrastructure
- ✅ NestJS 11 framework
- ✅ PostgreSQL 16 database
- ✅ Redis 7 job queue
- ✅ Docker Compose setup
- ✅ Prisma ORM

### 🔐 Authentication & Security
- ✅ Auth0 integration (JWT)
- ✅ Role-based access control
- ✅ Auto-registration
- ✅ JWKS validation

### 📊 Core Features
- ✅ User management
- ✅ Device registration
- ✅ Schedule management
- ✅ Nudge generation engine
- ✅ Walk session tracking
- ✅ Push notifications
- ✅ Offline sync
- ✅ Analytics & reporting
- ✅ Behavior logging

### 👨‍🔬 Research Tools
- ✅ Study management
- ✅ Data export
- ✅ Dashboard UI
- ✅ Analytics queries

### 📚 Documentation
- ✅ API Reference (993 lines)
- ✅ Architecture docs (446 lines)
- ✅ Swagger UI
- ✅ Setup guides

## File Changes

```bash
# All changes are additions (no modifications or deletions)
$ git diff --stat main nestjs

backend/.dockerignore                      |     6 +
backend/.env.example                       |    24 +
backend/.gitignore                         |     5 +
backend/Dockerfile                         |    19 +
backend/docker-compose.yml                 |    75 +
backend/package.json                       |    91 +
backend/package-lock.json                  | 11768 +++++++++++++++
backend/prisma/schema.prisma               |   393 ++
backend/src/**/*.ts                        |  6000+ lines
backend/docs/**/*.md                       |  1598 lines
backend/test/**/*.ts                       |    34 +

Total: 102 files changed, 19513 insertions(+)
```

## Branch History

### Main Branch
```
0a2c6f6 - enhanced the visualization of the Today Screen
(grafted history)
```

### NestJS Branch
```
872b12f - Backend Implementation Successful (Feb 17, 2026)
0a2c6f6 - enhanced the visualization of the Today Screen
(grafted history)
```

## Technology Stack Comparison

### Main Branch
- React Native
- Expo
- TypeScript
- SQLite (local)
- React Navigation
- React Native Paper

### NestJS Branch (adds)
- **All of main branch PLUS:**
- NestJS 11
- PostgreSQL 16
- Prisma ORM
- Redis 7
- BullMQ
- Auth0
- Expo Server SDK
- Swagger/OpenAPI
- Docker

## API Modules in nestjs Branch

1. **Core** - PrismaModule, ConfigModule, AuthModule
2. **Users** - UsersModule, DevicesModule, PreferencesModule
3. **Scheduling** - ScheduleModule, ManualScheduleModule
4. **Nudging** - NudgeEngineModule, NudgePlansModule, PushNotificationsModule
5. **Data** - WalkSessionsModule, AnalyticsModule, BehaviorLogModule
6. **Research** - ResearcherModule, DashboardSpaModule
7. **Sync** - SyncModule
8. **Workers** - WorkersModule (background jobs)

## Integration Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Mobile App                          │
│                 (Both Branches)                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ HTTP/REST
                     │ (nestjs branch only)
                     ▼
┌─────────────────────────────────────────────────────────┐
│               NestJS Backend API                        │
│            (Only in nestjs branch)                      │
│  ┌────────────────────────────────────────────────┐    │
│  │  /api/users, /api/schedule, /api/nudges, etc. │    │
│  └────────────────────────────────────────────────┘    │
└────────┬─────────────────────────────┬──────────────────┘
         │                             │
         ▼                             ▼
┌──────────────┐              ┌──────────────┐
│  PostgreSQL  │              │    Redis     │
│      16      │              │      7       │
└──────────────┘              └──────────────┘
```

## Migration Path

To merge nestjs branch into main:

1. ✅ Review backend code (already added)
2. ⬜ Setup infrastructure (PostgreSQL, Redis)
3. ⬜ Configure Auth0 tenant
4. ⬜ Update mobile app API endpoints
5. ⬜ Test integration
6. ⬜ Deploy backend services
7. ⬜ Merge branches

## Conclusion

The **nestjs** branch transforms GapWalk from a standalone mobile app into a **full-stack research platform** by adding a complete backend infrastructure. This enables:

- ✅ Centralized data collection
- ✅ Server-side nudge computation
- ✅ Push notification management
- ✅ Researcher tools and analytics
- ✅ Multi-user study support
- ✅ Data export and analysis

**For full technical details, see [BRANCH_COMPARISON.md](./BRANCH_COMPARISON.md)**
