-- ENKAI LODGEFLOW — GATE 2.0
-- Room inventory: categories, rooms, pricing, import runs.
-- Written for PostgreSQL 13+.
--
-- Notes:
--  * IDs stay TEXT so Phase 1 identifiers (`room-101`, `cat-standard`) survive
--    the browser -> server migration unchanged. Future reservations reference
--    rooms.id, so identity must remain stable.
--  * Pricing is stored inline because Phase 1 models it as a 1:1 nested object.
--  * Rooms are soft-deleted (`archived_at`) so historical references can never
--    dangle once reservations exist. D15's deletion guard is enforced in the
--    API layer and remains compatible with an ON DELETE RESTRICT foreign key.
--  * `null` rates mean "not configured" and must never be coerced to zero.

CREATE TABLE IF NOT EXISTS room_categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_categories_name_not_blank CHECK (btrim(name) <> '')
);

-- Category names are unique case-insensitively, ignoring surrounding spaces.
CREATE UNIQUE INDEX IF NOT EXISTS room_categories_name_unique
  ON room_categories (lower(btrim(name)));


CREATE TABLE IF NOT EXISTS rooms (
  id                 TEXT PRIMARY KEY,
  room_number        TEXT NOT NULL,
  name               TEXT,
  category_id        TEXT NOT NULL
                       REFERENCES room_categories (id) ON DELETE RESTRICT,
  floor              TEXT NOT NULL,
  capacity           INTEGER NOT NULL,
  status             TEXT NOT NULL,
  description        TEXT,
  hourly_rate        NUMERIC(12, 2),
  daily_rate         NUMERIC(12, 2),
  overnight_rate     NUMERIC(12, 2),
  currency           CHAR(3) NOT NULL DEFAULT 'TZS',
  pricing_updated_at TIMESTAMPTZ,
  archived_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rooms_room_number_not_blank CHECK (btrim(room_number) <> ''),
  CONSTRAINT rooms_floor_not_blank CHECK (btrim(floor) <> ''),
  CONSTRAINT rooms_capacity_range CHECK (capacity BETWEEN 1 AND 20),
  CONSTRAINT rooms_status_valid CHECK (
    status IN (
      'AVAILABLE',
      'OCCUPIED',
      'RESERVED',
      'CLEANING',
      'MAINTENANCE',
      'OUT_OF_SERVICE'
    )
  ),
  CONSTRAINT rooms_currency_tzs CHECK (currency = 'TZS'),
  CONSTRAINT rooms_rates_non_negative CHECK (
    (hourly_rate IS NULL OR hourly_rate >= 0)
    AND (daily_rate IS NULL OR daily_rate >= 0)
    AND (overnight_rate IS NULL OR overnight_rate >= 0)
  )
);

-- Phase 1 duplicate rule: case-insensitive and whitespace-insensitive.
-- Archived rooms release their number so a replacement room can be added.
CREATE UNIQUE INDEX IF NOT EXISTS rooms_room_number_unique
  ON rooms (lower(btrim(room_number)))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS rooms_category_id_idx
  ON rooms (category_id);

CREATE INDEX IF NOT EXISTS rooms_active_order_idx
  ON rooms (created_at, id)
  WHERE archived_at IS NULL;


-- One row per successfully committed browser -> server import. The unique
-- payload hash makes a repeated import of the same data impossible.
CREATE TABLE IF NOT EXISTS room_import_runs (
  id           TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  summary      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS room_import_runs_payload_hash_unique
  ON room_import_runs (payload_hash);
