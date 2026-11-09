-- ENKAI LODGEFLOW — Multi-Tenant Platform & Lodge Operations Schema Migration
-- Applied on top of 0001_room_inventory.sql

CREATE TABLE IF NOT EXISTS tenants (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  subscription_tier TEXT NOT NULL DEFAULT 'ENTERPRISE',
  status         TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  code           TEXT NOT NULL,
  timezone       TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  address        TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS branches_tenant_code_unique ON branches(tenant_id, code);

CREATE TABLE IF NOT EXISTS buildings (
  id         TEXT PRIMARY KEY,
  branch_id  TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS floors (
  id           TEXT PRIMARY KEY,
  building_id  TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  floor_number INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guests (
  id                   TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name            TEXT NOT NULL,
  phone                TEXT,
  email                TEXT,
  identification_number TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reservations (
  id              TEXT PRIMARY KEY,
  branch_id       TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  room_id         TEXT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  guest_id        TEXT NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
  check_in_date   TIMESTAMPTZ NOT NULL,
  check_out_date  TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'CONFIRMED',
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guest_stays (
  id               TEXT PRIMARY KEY,
  reservation_id   TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  room_id          TEXT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  guest_id         TEXT NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
  actual_check_in  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actual_check_out TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'IN_HOUSE',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id             TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  total_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'PENDING',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id             TEXT PRIMARY KEY,
  invoice_id     TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'CASH',
  reference      TEXT,
  paid_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY,
  branch_id   TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  description TEXT,
  incurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff (
  id           TEXT PRIMARY KEY,
  branch_id    TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'RECEPTIONIST',
  access_tier  TEXT NOT NULL DEFAULT 'RBAC_ENCRYPTED_L2',
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cctv_agents (
  id             TEXT PRIMARY KEY,
  branch_id      TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  agent_name     TEXT NOT NULL,
  ip_address     TEXT,
  status         TEXT NOT NULL DEFAULT 'ONLINE',
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cctv_cameras (
  id             TEXT PRIMARY KEY,
  agent_id       TEXT NOT NULL REFERENCES cctv_agents(id) ON DELETE CASCADE,
  branch_id      TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  camera_name    TEXT NOT NULL,
  rtsp_url       TEXT,
  stream_status  TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS door_line_configurations (
  id                       TEXT PRIMARY KEY,
  camera_id                TEXT NOT NULL REFERENCES cctv_cameras(id) ON DELETE CASCADE,
  room_id                  TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  threshold_polygon_json   JSONB NOT NULL,
  inside_direction         TEXT NOT NULL DEFAULT 'INTO_LEFT_DOOR'
);

CREATE TABLE IF NOT EXISTS cctv_events (
  id                     TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id              TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  camera_id              TEXT NOT NULL,
  room_id                TEXT NOT NULL,
  event_type             TEXT NOT NULL,
  person_id              TEXT NOT NULL,
  video_timestamp        TEXT NOT NULL,
  dar_es_salaam_time     TEXT,
  confidence             NUMERIC(4,3) NOT NULL,
  verification_status    TEXT NOT NULL,
  evidence_clip_url      TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_analysis_jobs (
  id                        TEXT PRIMARY KEY,
  event_id                  TEXT,
  model_name                TEXT NOT NULL,
  status                    TEXT NOT NULL,
  raw_gemini_response_json  JSONB,
  tokens_used               INTEGER DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_investigations (
  id                       TEXT PRIMARY KEY,
  event_id                 TEXT NOT NULL REFERENCES cctv_events(id) ON DELETE CASCADE,
  pms_match_status         TEXT NOT NULL DEFAULT 'UNMATCHED_ENTRY',
  investigation_status     TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
  reviewer_staff_id        TEXT,
  notes                    TEXT,
  potential_revenue_exposure NUMERIC(12,2) DEFAULT 0,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
