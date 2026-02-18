# Branch Comparison: main vs nestjs

## Overview

This document provides a detailed comparison between the `main` and `nestjs` branches of the GapWalk repository.

## Summary of Differences

The **nestjs** branch contains a complete backend implementation that is **NOT present** in the main branch. This represents a major architectural addition to the project.

### High-Level Changes

- **Main Branch**: Contains only the mobile app frontend (React Native/Expo)
- **NestJS Branch**: Contains the mobile app frontend + complete backend API server implementation

### Commit Differences

- **NestJS Branch**: 1 commit ahead of main
  - Commit: `872b12f` - "Backend Implementation Successful" (Feb 17, 2026)
- **Main Branch**: Up to date with commit `0a2c6f6` - "enhanced the visualization of the Today Screen"

## Backend Addition (nestjs branch only)

The nestjs branch adds a complete `backend/` directory with **102 files** and **19,513 lines of code**.

### Technology Stack

The backend uses the following technologies:

| Component | Technology |
|-----------|-----------|
| Framework | NestJS 11, TypeScript 5.7 |
| Database | PostgreSQL 16 with Prisma 7.4 ORM |
| Queue System | Redis 7 + BullMQ |
| Authentication | Auth0 (RS256 JWT via JWKS) |
| Push Notifications | Expo Server SDK |
| API Documentation | Swagger (OpenAPI 3) |
| Dashboard | Chart.js SPA |

### Key Backend Features

#### 1. **API Modules** (18 total)

The backend implements a comprehensive REST API with the following modules:

- **Core Infrastructure**
  - `PrismaModule` - Database client
  - `ConfigModule` - Environment configuration
  - `AuthModule` - Auth0 JWT authentication

- **User Management**
  - `UsersModule` - User profile CRUD
  - `DevicesModule` - Expo push token management
  - `PreferencesModule` - Walk goals and notification settings

- **Scheduling**
  - `ScheduleModule` - Schedule sources and busy events
  - `ManualScheduleModule` - Weekly template to busy event generation

- **Nudge System**
  - `NudgeEngineModule` - Gap-finding algorithm and plan generation
  - `NudgePlansModule` - Nudge plan lifecycle management
  - `PushNotificationsModule` - Expo push sending and receipt checking

- **Data Collection**
  - `WalkSessionsModule` - Walk recording and statistics
  - `AnalyticsModule` - Events, crash reports, aggregations
  - `BehaviorLogModule` - Nudge response behavior tracking
  - `SyncModule` - Bidirectional offline-first synchronization

- **Research Tools**
  - `ResearcherModule` - Study management and data export
  - `DashboardSpaModule` - Dashboard API and static serving

- **Background Jobs**
  - `WorkersModule` - BullMQ background job processors

#### 2. **Database Schema**

The Prisma schema includes:
- **16 models** for different data entities
- **8 enums** for type safety
- Comprehensive relationships between entities

#### 3. **Background Workers**

BullMQ-based job processors for:
- `nudge-generation.processor` - Computing nudge schedules
- `push-send.processor` - Sending push notifications
- `receipt-check.processor` - Checking push delivery status
- `aggregation.processor` - Computing analytics aggregations

#### 4. **API Endpoints**

Key endpoint categories:
- `/api` - API base path
- `/docs` - Interactive Swagger UI documentation
- `/health` - Health check endpoint
- `/dashboard` - Researcher dashboard SPA

#### 5. **Authentication & Authorization**

- Three role levels: `participant`, `researcher`, `admin`
- Auto-registration on first JWT validation
- Role-based access control (RBAC) via guards

#### 6. **Deployment**

Docker Compose setup including:
- PostgreSQL 16 database
- Redis 7 for job queue
- Automated Prisma migrations
- Production-ready API container

### File Structure Added

```
backend/
├── .dockerignore
├── .env.example
├── .gitignore
├── .prettierrc
├── Dockerfile
├── README.md
├── dashboard/
│   └── public/index.html
├── docker-compose.yml
├── docs/
│   ├── API_REFERENCE.md          # Complete REST API documentation
│   └── ARCHITECTURE.md           # System architecture and data flow
├── eslint.config.mjs
├── nest-cli.json
├── package.json
├── package-lock.json
├── prisma/
│   └── schema.prisma             # Database schema
├── prisma.config.ts
├── src/
│   ├── main.ts                   # Application bootstrap
│   ├── app.module.ts             # Root module
│   ├── app.controller.ts
│   ├── app.service.ts
│   ├── analytics/                # Analytics module
│   ├── auth/                     # Authentication module
│   ├── behavior-log/             # Behavior tracking module
│   ├── common/                   # Shared utilities
│   │   ├── decorators/
│   │   ├── dto/
│   │   ├── filters/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   └── interfaces/
│   ├── config/                   # Configuration module
│   ├── dashboard-spa/            # Dashboard module
│   ├── devices/                  # Device management module
│   ├── manual-schedule/          # Manual scheduling module
│   ├── nudge-engine/             # Nudge algorithm module
│   ├── nudge-plans/              # Nudge plans module
│   ├── preferences/              # User preferences module
│   ├── prisma/                   # Prisma service
│   ├── push-notifications/       # Push notifications module
│   ├── researcher/               # Researcher tools module
│   ├── schedule/                 # Scheduling module
│   ├── sync/                     # Synchronization module
│   ├── users/                    # User management module
│   ├── walk-sessions/            # Walk sessions module
│   └── workers/                  # Background workers module
├── test/
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
├── tsconfig.json
└── tsconfig.build.json
```

## Architecture Changes

### System Architecture

The nestjs branch introduces a **hybrid nudging platform** with:

1. **Backend-First Scheduling**: Server computes optimal nudge times
2. **Mobile Fallback**: App includes local gap-finding engine for offline use
3. **Bidirectional Sync**: Offline-first data synchronization
4. **Background Processing**: Asynchronous job queues for nudge generation and push delivery

### Data Flow

```
Mobile App (SQLite) 
    ↕ Sync
Backend API (PostgreSQL)
    → BullMQ Workers
    → Expo Push Notifications
    → Mobile App
```

## Dependencies Added

The backend adds **45 production dependencies** including:

**Core Framework:**
- @nestjs/* family (common, core, platform-express, swagger, config, passport, bullmq, serve-static)

**Database & ORM:**
- @prisma/client
- prisma

**Authentication:**
- passport
- passport-jwt
- jwks-rsa

**Queue System:**
- bullmq
- ioredis

**Push Notifications:**
- expo-server-sdk

**Utilities:**
- class-transformer
- class-validator
- date-fns
- uuid

**Documentation:**
- swagger-ui-express

Plus **24 development dependencies** for testing, linting, and TypeScript support.

## Environment Variables Required

The backend requires several new environment variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection URL |
| `AUTH0_DOMAIN` | Auth0 tenant domain |
| `AUTH0_AUDIENCE` | Auth0 API audience |
| `AUTH0_CLIENT_ID` | Auth0 application client ID |
| `AUTH0_CLIENT_SECRET` | Auth0 application client secret |
| `EXPO_ACCESS_TOKEN` | Expo push notification token |
| `PORT` | HTTP port (default: 3000) |
| `NODE_ENV` | Environment mode |
| `CORS_ORIGIN` | Allowed CORS origin |
| `GOOGLE_CLIENT_ID` | Google Calendar OAuth (optional) |
| `GOOGLE_CLIENT_SECRET` | Google Calendar OAuth (optional) |

## Key Algorithms Implemented

1. **Gap-Finding Algorithm**: Identifies schedule gaps suitable for micro-walks
2. **Nudge Generation**: Creates personalized nudge schedules
3. **Push Notification Delivery**: Manages Expo push notification lifecycle
4. **Analytics Aggregation**: Computes usage statistics and engagement metrics

## Testing Infrastructure

The backend includes:

- Jest unit testing framework
- E2E testing setup
- Coverage reporting
- Test utilities in `test/` directory

## Documentation

The backend includes comprehensive documentation:

1. **README.md** - Quick start guide and setup instructions
2. **docs/API_REFERENCE.md** - Complete REST API reference (993 lines)
3. **docs/ARCHITECTURE.md** - System architecture and design decisions (446 lines)
4. **Swagger UI** - Interactive API documentation at `/docs` endpoint

## Impact Analysis

### What Changed
- ✅ Complete backend API server added
- ✅ Database schema and ORM setup
- ✅ Authentication and authorization system
- ✅ Background job processing
- ✅ Push notification infrastructure
- ✅ Researcher dashboard
- ✅ Analytics and data export tools

### What Stayed the Same
- ✅ Mobile app codebase (unchanged)
- ✅ Frontend dependencies (unchanged)
- ✅ React Native/Expo setup (unchanged)

### Integration Points

The backend is designed to integrate with the existing mobile app through:
1. REST API endpoints (mobile app calls `/api/*`)
2. Auth0 authentication (shared JWT tokens)
3. Expo push notifications (server sends, app receives)
4. Bidirectional sync endpoint (`/api/sync`)

## Next Steps for Integration

To fully integrate the nestjs branch with the main branch:

1. **Merge Decision**: Decide whether to merge backend into main
2. **Environment Setup**: Configure Auth0, PostgreSQL, Redis infrastructure
3. **Mobile App Updates**: Update API endpoints in mobile app to point to backend
4. **Testing**: Test end-to-end integration
5. **Deployment**: Deploy backend services (database, API, Redis)
6. **Documentation**: Update main README to include backend setup

## Conclusion

The **nestjs** branch represents a complete backend implementation that transforms GapWalk from a mobile-only app into a full-stack platform. It adds:

- **19,513 lines of code** across **102 files**
- **18 NestJS modules** for API functionality
- **Complete database schema** with 16 models
- **Background job processing** with 4 worker types
- **Comprehensive documentation** (1,598 lines)
- **Production-ready deployment** configuration

The main branch remains focused on the mobile app, while the nestjs branch provides the server-side infrastructure necessary for the research intervention platform to function.
