# ENKAI LODGEFLOW — Multi-Tenant Lodge Management & AI CCTV Intelligence Platform
## Architecture Audit & Implementation Plan

This implementation plan details the target architecture, database schema, API contracts, application separation (CCTV Agent, Lodge Management Portal, Platform Management Portal, Central Cloud Backend), and phased rollout for the production-grade **ENKAI LODGEFLOW** platform.

---

## 1. Existing Repository Architecture Audit

### Current State
- **Frontend**: React 19 SPA built with Vite, Tailwind CSS v4, and Lucide React icons. Features the newly redesigned **Blue & White Enterprise Dashboard** supporting 9 screens (Dashboard, CCTV Monitoring, Video Analysis, Room Activity, Event Timeline, Room Handover, Reports & Analytics, Administration, Settings).
- **Backend**: Express server (`server.ts`) supporting Vite middleware in development, multer file uploads (`/api/upload-init`, `/api/upload-chunk`), async background job processing (`/api/analyze-start`, `/api/analyze-status/:jobId`), and automatic multi-model Gemini free-tier failover cascade (`gemini-3.1-flash-lite` -> `gemini-flash-latest` -> `gemini-3.8-flash`).
- **Database**: PostgreSQL connection pooling via Neon (`neon.ts`, `@neondatabase/serverless` / `pg`), with initial schema migrations and room management foundation routes (`/server/routes/rooms.ts`, etc.).
- **Video & AI Engine**: Multimodal video understanding using `@google/genai` SDK with strict structured JSON schemas (`GeminiVideoAnalysisResponse`), deterministic occupancy engine (`occupancyEngine.ts`), and Phase 0.3 accuracy validation framework.

### Gaps vs Master Development Objectives
1. **Multi-Tenancy & Tenant Isolation**: Currently single-tenant; needs tenant/branch scoping across all DB tables and API endpoints.
2. **CCTV Agent Separation**: Needs an explicit local agent package/service design (Node.js/Python local daemon) for edge RTSP stream ingestion, multi-door polygon ROI mapping, local evidence clip buffering, and offline sync queue.
3. **Lodge Management Portal Expansion**: Needs full PMS modules (Reservations, Guest Management, Check-in/out, Billing & Invoicing, Expenses, Housekeeping) integrated with CCTV intelligence and Unrecorded Revenue Investigation.
4. **Platform Management Portal**: Needs a separate tenant/business/subscription administration interface for ENKAI platform owners.

---

## 2. Proposed Target Architecture

ENKAI LODGEFLOW is structured into three connected applications communicating with a centralized multi-tenant Cloud Backend:

```
+-------------------------------------------------------------+
|               ENKAI PLATFORM MANAGEMENT PORTAL              |
|        (Tenant, Subscription, Device Registry, AI Billing)  |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                 CENTRAL CLOUD BACKEND (Node.js)             |
|     (Multi-Tenant REST/WS, Auth/RBAC, Validation, Gemini)   |
+-------------------------------------------------------------+
          ^                    ^                    ^
          |                    |                    |
          | (Cloud Sync &      | (HTTPS REST &      | (Tenant Isolation
          |  Evidence Upload)  |  WebSocket)        |  & Branch Scoping)
          v                    v                    v
+------------------+  +-------------------+  +----------------+
|  ENKAI CCTV      |  |  ENKAI LODGE      |  |  POSTGRESQL    |
|  AGENT (Edge)    |  |  MANAGEMENT       |  |  DATABASE      |
|  (RTSP/YOLO/     |  |  PORTAL           |  |  (Multi-Tenant |
|   Local Clip     |  |  (PWA / Desktop)  |  |   Relational)  |
|   Buffering)     |  +-------------------+  +----------------+
+------------------+
```

---

## 3. Application Separation & Communication Diagram

1. **ENKAI CCTV Agent (Edge)**:
   - Runs locally at each lodge branch.
   - Connects to IP/RTSP cameras.
   - Detects doorway crossings (Doorway Polygon Zones).
   - Buffers local evidence clips (10s before, 15s after).
   - Synchronizes with Cloud Backend via secure HTTPS/WebSocket (with offline local queue and automatic retry).
2. **ENKAI Lodge Management Portal (Web/PWA/Desktop)**:
   - Used by receptionists, cashiers, and lodge managers.
   - Handles PMS operations, room status, check-in/out, billing, and unrecorded revenue investigations.
3. **ENKAI Platform Management Portal (Web/PWA/Desktop)**:
   - Used by ENKAI SaaS platform admins.
   - Manages tenants, lodge businesses, branches, subscriptions, CCTV device health, and global AI usage.

---

## 4. Multi-Tenant Database Entity Relationship Design

### Platform & Tenant Domain
- `tenants` (id, name, slug, subscription_tier, status, created_at)
- `tenant_users` (id, tenant_id, user_id, role, permissions, created_at)
- `branches` (id, tenant_id, name, code, timezone, address, status, created_at)

### Lodge Operations Domain
- `buildings` (id, branch_id, name)
- `floors` (id, building_id, name, floor_number)
- `room_types` (id, tenant_id, name, base_price)
- `rooms` (id, branch_id, floor_id, room_type_id, room_number, lifecycle_state, registered_guests)
- `doors` (id, room_id, door_identifier, position_description)
- `guests` (id, tenant_id, full_name, phone, email, identification_number)
- `reservations` (id, room_id, guest_id, check_in_date, check_out_date, status)
- `guest_stays` (id, reservation_id, room_id, guest_id, actual_check_in, actual_check_out, status)
- `invoices` (id, reservation_id, total_amount, paid_amount, status)
- `payments` (id, invoice_id, amount, payment_method, reference, paid_at)
- `staff` (id, branch_id, full_name, role, access_tier, active)

### CCTV & AI Intelligence Domain
- `cctv_agents` (id, branch_id, agent_name, ip_address, status, last_seen_at)
- `cctv_cameras` (id, agent_id, branch_id, camera_name, rtsp_url, stream_status)
- `door_line_configurations` (id, camera_id, room_id, threshold_polygon_json, inside_direction)
- `cctv_events` (id, tenant_id, branch_id, camera_id, room_id, event_type, person_id, video_timestamp, dar_es_salaam_time, confidence, verification_status, evidence_clip_url)
- `ai_analysis_jobs` (id, event_id, model_name, status, raw_gemini_response_json, tokens_used)
- `event_investigations` (id, event_id, pms_match_status, investigation_status, reviewer_staff_id, notes, potential_revenue_exposure)

---

## 5. API Contract Plan

### Agent Ingestion APIs (`/api/v1/agent/*`)
- `POST /api/v1/agent/enroll` — Authenticate and register local CCTV Agent device.
- `POST /api/v1/agent/events/batch` — Sync queued doorway crossing events and metadata.
- `POST /api/v1/agent/clips/upload` — Upload evidence video clips with HMAC signature.
- `GET /api/v1/agent/config` — Retrieve updated camera and door boundary configurations.

### Lodge Portal APIs (`/api/v1/lodge/*`)
- `GET /api/v1/lodge/dashboard-stats` — Real-time branch occupancy, reservations, and CCTV metrics.
- `GET/POST /api/v1/lodge/reservations` — PMS reservation management.
- `POST /api/v1/lodge/check-in` & `POST /api/v1/lodge/check-out` — Guest stay lifecycle.
- `GET /api/v1/lodge/cctv-events` — Filtered event timeline and Gemini verification results.
- `GET/PUT /api/v1/lodge/investigations` — Unrecorded revenue investigation workflow.

### Platform Portal APIs (`/api/v1/platform/*`)
- `GET/POST /api/v1/platform/tenants` — Multi-tenant management.
- `GET /api/v1/platform/devices/health` — Global CCTV Agent & camera health monitoring.
- `GET /api/v1/platform/ai/usage` — Gemini API token consumption and cost reporting.

---

## 6. CCTV Agent Installation Architecture

- **Runtime**: Lightweight Node.js or Python daemon with native FFmpeg bindings for RTSP stream processing and OpenCV/YOLO for edge person detection.
- **Service Installation**: Provided as a Windows `.msi` service and Linux systemd service.
- **Local Storage**: Local SQLite database for offline event queuing and circular buffer storage for video clips (`/var/lib/enkai/clips`).
- **Sync Engine**: Background worker that monitors internet connectivity, encrypts and uploads batched events when online, and applies exponential backoff on network failures.

---

## 7. Lodge Portal Screen & Navigation Map

1. **Dashboard**: Branch KPI cards, live CCTV feeds, occupancy trends, recent alerts.
2. **Reservations**: Calendar view, booking creation, guest details.
3. **Guest Management**: Guest directory, ID verification, history.
4. **Check-In & Check-Out**: Seamless stay transitions.
5. **Room Management**: Floors, room types, pricing, door mapping.
6. **Room Status / Housekeeping**: Real-time cleaning and maintenance queues.
7. **Reception Operations**: Front desk daily operations and cash drawer.
8. **Billing & Invoices**: Folio management, payments, receipts.
9. **Expenses**: Lodge operating expense tracking.
10. **Staff Management**: Employee directory and shifts.
11. **Branch Management**: Multi-branch overview.
12. **CCTV Intelligence**: Live device health, door configurations, event feed.
13. **Unrecorded Revenue Investigation**: Automated PMS matching vs CCTV occupancy discrepancies.
14. **Operational Reports**: Revenue, occupancy, and audit reports.
15. **Settings**: Branch preferences and user permissions.

---

## 8. Platform Portal Screen & Navigation Map

1. **Platform Dashboard**: Global tenant count, active cameras, system health.
2. **Tenant & Business Management**: Tenant onboarding, subscription plans, status.
3. **Branch & Site Directory**: Global branch mapping.
4. **CCTV Device Registry**: Agent installations, camera status, firmware versions.
5. **AI Processing & Gemini Monitoring**: Token usage, model failover logs, latency tracking.
6. **Platform Audit Logs**: Cross-tenant administrative activity audit.
7. **Billing & Subscriptions**: SaaS revenue and invoicing.
8. **System Settings**: Global platform defaults and API credentials.

---

## 9. Gemini Verification Workflow

1. **Trigger**: Local CCTV Agent detects doorway crossing and uploads evidence clip.
2. **Queue**: Cloud Backend creates pending verification job.
3. **Execution**: Server calls Gemini Multimodal API (`gemini-3.1-flash-lite` with fallback cascade) using the exact structured JSON schema (`GEMINI_ANALYSIS_RESPONSE_SCHEMA`).
4. **Validation**: Backend validates AI response against business rules and room state.
5. **PMS Matching**: Backend compares AI event timestamps against active reservations and `guest_stays`.
6. **Investigation**: If an unmatched entry is detected, an item is created in the **Unrecorded Revenue Investigation** queue for lodge manager review.

---

## 10. Phased Implementation Roadmap

- **Phase 1**: Database schema expansion for multi-tenancy, tenants, branches, PMS entities, and CCTV events.
- **Phase 2**: Central Cloud Backend API expansion supporting multi-tenant scoping and CCTV event ingestion.
- **Phase 3**: Lodge Management Portal expansion (Reservations, Check-in/out, Billing, Unrecorded Revenue Investigation module).
- **Phase 4**: Platform Management Portal implementation (Tenant management, subscription tiers, global device health).
- **Phase 5**: CCTV Agent architecture package (Local RTSP ingestion, multi-door ROI mapping, offline sync queue).
