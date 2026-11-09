# PHASE 13A PRE-IMPLEMENTATION AUDIT

**Date**: November 9, 2026
**System**: ENKAI LODGEFLOW — CCTV Edge Agent

## 1. Executive Summary
This audit evaluates the requirements to transform the placeholder `/apps/cctv-edge-agent/` into a functional, independently deployable edge application capable of local computer vision processing, RTSP stream management, and secure cloud synchronization.

## 2. Current State Assessment
- **Status**: The `/apps/cctv-edge-agent/` currently exists as a scaffolded frontend application with no functional CCTV or synchronization logic.
- **Dependencies**: The `Lodge Management` application handles the video analysis pipeline (via Gemini cloud), which must be decoupled so the `Edge Agent` can handle event detection independently.
- **Backend API**: The central backend (`/server/`) handles CCTV event storage and analysis, but lacks the device-specific registration and local-to-cloud synchronization APIs required by the Edge Agent.

## 3. Architecture & Design Gap Analysis
- **Core Service**: A new node/background process (separate from the frontend) is required to manage video processing, which cannot run reliably within a browser/React lifecycle.
- **Local Database**: Need to integrate SQLite/local storage within the Agent to handle event buffering.
- **Device Identity**: Missing registration/provisioning flow for unique `AgentID` / `DeviceID` binding.
- **RTSP/ONVIF**: Requires integrating a native RTSP stream handler; standard browser `video` elements cannot process raw RTSP.
- **Edge Vision**: Need to integrate a detection/tracking library (OpenCV/YOLO) for local door-line crossing detection.

## 4. Proposed Migration Plan
1. **Agent Service**: Develop the core Node.js-based Edge Service for RTSP stream management and video analytics.
2. **Device Identity**: Implement secure agent registration endpoint in the central cloud backend.
3. **Local DB**: Implement local SQLite storage for event buffering/queuing.
4. **Synchronization**: Implement idempotent sync service between local Agent and Central Backend.
5. **UI**: Refactor the Edge Agent frontend to act as a monitoring and configuration UI for the Agent Core Service.
