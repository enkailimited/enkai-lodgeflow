# PHASE 12A PRE-IMPLEMENTATION AUDIT: ARCHITECTURE SEPARATION

**Date**: November 9, 2026
**System**: ENKAI LODGEFLOW

## 1. Executive Summary
The current architecture uses a single React application in `/src/` with a `PortalMode` switch to control navigation. The backend is a single Node/Express server. This audit outlines the path to refactoring this into three independent applications (Lodge, Platform, Agent) as requested in Phase 12A.

## 2. Current State Assessment
- **Frontend Entry Point**: `/src/main.tsx` and `index.html`.
- **Portal Logic**: Controlled by `portalMode` and `AppLayout.tsx` in `/src/components/layout/`.
- **Backend API**: Single Node server (`server.ts`) serving all routes.
- **Data Sharing**: Heavy reliance on shared state in `App.tsx` and common types in `/src/types/lodgeflow.ts`.
- **Security**: Relies on `adminToken.ts` middleware and frontend sidebar hiding.

## 3. Migration Plan
### 3.1 Workspace Refactoring
- Create `/apps/lodge-management/`, `/apps/platform-management/`, `/apps/cctv-edge-agent/`.
- Create `/packages/shared/` for shared types, API client, and shared UI components to minimize code duplication.
- Refactor the current `/src/` into the appropriate new application structures.

### 3.2 Frontend Refactoring
- Create independent entry points for each application.
- Remove `PortalMode` logic from `AppLayout`.
- Establish separate build configurations (Vite) for each app.

### 3.3 Backend Refactoring
- Keep `/server/` as the Central Cloud Backend.
- Update API route handlers to perform independent authentication/authorization checks for each application type.
- Ensure strict tenant/branch isolation for all routes regardless of which application initiated the request.

### 3.4 Security Alignment
- Replace shared tokens with distinct authentication flows for each application (e.g., user sessions for portals, registered device tokens for the agent).
- Implement robust server-side RBAC checks in all routes.
