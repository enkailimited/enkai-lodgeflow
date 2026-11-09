# Room inventory database — Gate 2.0

PostgreSQL is the authoritative source for rooms, room categories and room
pricing. The browser only keeps a read-through cache in memory; `localStorage`
is read **once**, by the explicit import tool, and is never written again.

## 1. Prerequisites

- PostgreSQL 13 or newer.
- A dedicated database, for example `enkai_lodgeflow`.
- The server runs on Node 24 with `tsx` (already in the project).

Create the database (example):

```sql
CREATE DATABASE enkai_lodgeflow;
```

## 2. Configuration

Copy `.env.example` to `.env` and set the server-only values:

```dotenv
DATABASE_URL="postgres://user:password@localhost:5432/enkai_lodgeflow"
DATABASE_URL_UNPOOLED=""      # Neon direct endpoint, used by migrations
PGSSL=""                      # "require" or "no-verify" for managed hosts
ROOM_ADMIN_TOKEN=""           # enables room/category deletion + local import
```

`.env` is git-ignored. **Never** prefix these with `VITE_`; anything `VITE_*`
is bundled into the browser.

### Neon

This deployment uses Neon (project `purple-snow-10764876`, branch
`production`). Neon gives one database two connection strings:

| Variable | Endpoint | Used for |
|---|---|---|
| `DATABASE_URL` | pooled (`…-pooler.…`) | application traffic through the `pg` pool |
| `DATABASE_URL_UNPOOLED` | direct | `npm run db:migrate` (DDL + advisory locks) |

The `pg` driver is the right choice here because the app is a long-lived Node
process (Express + `tsx`), not a serverless/edge function, so a reused pool is
preferred over the HTTP serverless driver.

Neon suspends idle compute. The pool allows `PG_CONNECT_TIMEOUT_MS`
(default `20000`) for the first connection after a suspend; a 5 s timeout
turned ordinary cold starts into `500`s during setup.

`neon.ts` declares the branch services (`preview.realtime`). `neon deploy`
reconciles them and pulls the branch env vars into `.env`.
`.neon` (project/branch link) is git-ignored.

## 3. Migrations

```bash
npm run db:migrate
```

The runner:

- creates `schema_migrations` if missing,
- takes a PostgreSQL advisory lock,
- applies every `db/migrations/*.sql` file once, in filename order,
- wraps each file in its own transaction.

Applied / skipped files are printed. Re-running is safe.

## 4. Room API

| Method | Route | Notes |
|---|---|---|
| `GET` | `/api/rooms` | active rooms only |
| `GET` | `/api/rooms/:id` | 404 when missing or archived |
| `POST` | `/api/rooms` | 201 |
| `PATCH` | `/api/rooms/:id` | full room body, or `{ "status": "CLEANING" }` |
| `DELETE` | `/api/rooms/:id` | `X-Admin-Token`; soft delete |
| `GET` | `/api/room-categories` | |
| `POST` | `/api/room-categories` | 201 |
| `PATCH` | `/api/room-categories/:id` | |
| `DELETE` | `/api/room-categories/:id` | `X-Admin-Token`; blocked while rooms exist |
| `POST` | `/api/room-import/preview` | read-only validation |
| `POST` | `/api/room-import/commit` | `X-Admin-Token`; transactional, one-shot |

Envelopes:

```json
{ "data": {}, "meta": { "requestId": "…" } }
{ "error": { "code": "…", "message": "…", "fieldErrors": {}, "requestId": "…" } }
```

Codes: `VALIDATION_FAILED` (422), `DUPLICATE_ROOM_NUMBER` / `DUPLICATE_CATEGORY_NAME`
(409), `ROOM_NOT_FOUND` / `CATEGORY_NOT_FOUND` (404), `CATEGORY_HAS_ROOMS` (409),
`ROOM_HAS_ACTIVE_RESERVATIONS` (409, reserved for Gate 2.4), `FORBIDDEN` (403),
`ADMIN_TOKEN_NOT_CONFIGURED` (503), `DATABASE_UNAVAILABLE` (503).

## 5. Importing the Phase 1 browser inventory

1. Open **Room Management**.
2. If the browser still contains `enkai-lodgeflow.room-inventory.v1`, an amber
   banner appears with the room/category counts.
3. Select **Review & import**. The server validates every record and returns a
   preview: importable, unchanged, conflicts and invalid counts plus per-record
   issues. Nothing is written at this stage.
4. Enter the server `ROOM_ADMIN_TOKEN` and choose **Import now**.
5. Records are inserted in one transaction. Existing rows are **never**
   overwritten: identical rows are reported as unchanged, differing rows as
   conflicts and skipped.
6. The same payload cannot be committed twice (payload hash + unique index).
7. After a successful import, **Clear browser copy** removes the local snapshot.
   This step is explicit and never automatic.
8. If the browser data needs fixing first, edit it and re-run the preview — the
   payload hash changes, so the new attempt is allowed.

Original Phase 1 IDs are preserved (`room-101`, `cat-standard`, …) because the
ID columns are `TEXT`. Future reservations reference `rooms.id`.

## 6. Deletion semantics

Rooms are soft-deleted (`archived_at`). This keeps historical references valid
and lets D15 be enforced without a later destructive migration:

- `DELETE /api/rooms/:id` checks for `PENDING` / `CONFIRMED` reservations when a
  `reservations` table exists (it does not yet).
- Categories cannot be deleted while any room references them.

## 7. Tests

```bash
npm run test:rooms       # Phase 1 foundation, no database required
npm run test:rooms:api   # HTTP + PostgreSQL; truncates the target database
```

`test:rooms:api` reads `TEST_DATABASE_URL` first, then `DATABASE_URL`. Use a
dedicated test database — the tables are truncated between tests. When neither
variable is set, the suite reports a skip rather than passing silently.
