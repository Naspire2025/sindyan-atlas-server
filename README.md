# Sindyan Atlas — Server

The backend API for **Sindyan Atlas**, an internal project-management application. Built with Express 4, TypeScript, and PostgreSQL.

## Features

- **Authentication** — email/password login, Argon2 password hashing, httpOnly session cookies, CSRF tokens, single-session enforcement
- **Authorization** — role-based access control (admin, project lead, team member) enforced server-side on every protected endpoint
- **Projects** — CRUD with owner, status, priority, deadlines, budget, and planning links
- **Tasks** — task lifecycle with status transitions, assignee, milestone linkage, comments, and activity log
- **Finance** — budget lines, spend records, and per-project financial summaries with projection
- **Vault** — AES-256-GCM encrypted secrets, markdown notes, tag system, file uploads via presigned S3 URLs, audit log
- **Resources** — capacity profiles, availability windows, member allocations with overlap detection, asset management
- **Risks & Issues** — tracking with severity, probability, progress, and owner
- **Planning** — phases, milestones, and project links
- **Dashboard** — portfolio health score, KPIs, overdue/blocked attention items
- **Cleanup** — automatic expiration of old security records

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Language | TypeScript (CommonJS output) |
| Database | PostgreSQL 16 via `pg` (raw driver) |
| Password hashing | Argon2 |
| Encryption | AES-256-GCM (vault secrets) |
| File storage | AWS S3 (presigned URLs) |
| Rate limiting | express-rate-limit |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 16+ running on `localhost:5432`
- An `atlas` database created (`createdb atlas`)

### Install

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/atlas

# Session
SESSION_IDLE_HOURS=12
SESSION_ABSOLUTE_DAYS=14
SESSION_COOKIE_NAME=atlas_session
SESSION_COOKIE_SAME_SITE=lax

# CORS
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:5174

# Bootstrap admin (created on first run if no admin exists)
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_NAME=Admin
BOOTSTRAP_ADMIN_PASSWORD=Admin123!@#

# Vault encryption (64-char hex string for AES-256-GCM)
VAULT_ENCRYPTION_KEY=<64-char-hex>

# Optional: S3 file storage
# R2_ACCOUNT_ID=
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_BUCKET_NAME=

# Optional: Invitation delivery webhook
# INVITATION_DELIVERY_WEBHOOK_URL=
```

### Scripts

```bash
npm run build          # Compile TypeScript to dist/
npm run start          # Run the compiled server
npm run dev            # Build and start
npm run typecheck      # Type-check without emitting
npm test               # Build and run integration tests
npm run seed           # Import projects from seeds/sindyan-projects-2026-2027.json
npm run seed:check     # Dry-run seed validation
```

### Development

```bash
npm run dev
```

The API starts on `http://localhost:3001`.

## Project Structure

```
src/
  config/
    env.ts                     # Environment variable parsing and validation
  db/
    connection.ts              # PostgreSQL connection pool
    migrate.ts                 # Schema migration (DDL, indexes, constraints)
    repositories/
      project.repository.ts    # Project queries
      task.repository.ts       # Task queries
      user.repository.ts       # User queries
      session.repository.ts    # Session queries
      finance.repository.ts    # Budget and spend queries
      vault.repository.ts      # Vault entry and secret queries
      resource.repository.ts   # Capacity, allocation, asset queries
      risk-issue.repository.ts # Risk and issue queries
      dashboard.repository.ts  # Dashboard aggregation queries
      membership.repository.ts # Project membership queries
      invitation.repository.ts # Invitation queries
  controllers/
      ...                      # HTTP request handlers (thin, no business logic)
  services/
      ...                      # Business logic and authorization rules
  middleware/
      require-auth.middleware.ts       # Session-based authentication
      require-csrf.middleware.ts       # CSRF token validation
      require-trusted-origin.middleware.ts  # Origin header check
      security-headers.middleware.ts   # Security response headers
      error-handler.middleware.ts      # Global error handler
  routes/
      ...                      # Express router definitions
  types/
      auth.ts                  # AuthenticatedUser and role types
      express.d.ts             # Express request augmentation
  utils/
      app-error.util.ts        # Typed HTTP error class
      password.util.ts         # Argon2 hash and verify
      token.util.ts            # Opaque token generation and hashing
      request.util.ts          # Request parsing helpers
  server.ts                    # Entry point (migration, bootstrap, listen)
  app.ts                       # Express app setup and route mounting
```

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Log in |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/csrf` | Refresh CSRF token |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project detail |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| GET | `/api/tasks` | List tasks (filtered by role) |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| GET | `/api/projects/:id/finance/financial-summary` | Financial summary |
| POST | `/api/projects/:id/finance/budget-lines` | Create budget line |
| PATCH | `/api/budget-lines/:id` | Update budget line |
| POST | `/api/projects/:id/finance/spend-records` | Create spend record |
| GET | `/api/projects/:id/risks` | List risks |
| POST | `/api/projects/:id/risks` | Create risk |
| GET | `/api/projects/:id/issues` | List issues |
| POST | `/api/projects/:id/issues` | Create issue |
| POST | `/api/projects/:id/phases` | Create phase |
| POST | `/api/projects/:id/milestones` | Create milestone |
| GET | `/api/dashboard/overview` | Portfolio KPIs |
| GET | `/api/dashboard/attention` | Overdue/blocked items |
| GET | `/api/users` | List users (admin) |
| POST | `/api/vault/entries` | Create vault entry |
| GET | `/api/vault/entries` | List vault entries |
| POST | `/api/assets` | Create asset |
| GET | `/api/resources/workload` | Workload view |

## Database

The schema uses 26 tables with:
- `SERIAL` primary keys
- `TIMESTAMPTZ` timestamps
- `NUMERIC` for monetary values
- `BYTEA` for encrypted vault secrets
- Foreign keys with explicit `ON DELETE` behavior
- Check constraints for enum validation
- Indexes on foreign keys, status columns, and common filters

Migrations run automatically on server start via `runMigrations()`.

## Security

- Passwords hashed with Argon2 (never stored in plaintext)
- Vault secrets encrypted with AES-256-GCM; encryption key never logged
- httpOnly session cookies with configurable SameSite
- CSRF tokens required for all state-changing requests
- Origin header validation against allowed frontend origins
- Rate limiting on login endpoint (10 attempts per 15 minutes)
- Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- Parameterized SQL queries throughout — no string interpolation
- Single-session enforcement (new login revokes previous session)

## Testing

```bash
npm test
```

Runs integration tests against the `atlas` PostgreSQL database. Tests cover migration schema, finance, dashboard, resources, risks, vault, and access control.

## License

Proprietary — Sindyan / Naspire 2025.
