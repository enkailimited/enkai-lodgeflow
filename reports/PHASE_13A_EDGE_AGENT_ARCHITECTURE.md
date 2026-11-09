# PHASE 13A EDGE AGENT ARCHITECTURE REPORT

**Date**: November 9, 2026
**System**: ENKAI LODGEFLOW — CCTV Edge Agent

## 1. Architecture Overview
The CCTV Edge Agent is now structured as a modular edge service with clear separation between the Core Service (background processing) and the Management Interface (frontend).

## 2. Component Design
- **Agent Core Service**: Independent Node.js service managing camera connections (RTSP/ONVIF), local computer vision pipeline, SQLite storage, and idempotent cloud synchronization.
- **Agent Management Interface**: React-based frontend providing configuration, monitoring, and diagnostic capabilities, communicating via local IPC or authenticated API with the Core Service.
- **Local Storage**: Embedded SQLite instance ensuring zero data loss during network interruptions.

## 3. Implementation Status
- **Audit**: Completed (`/reports/PHASE_13A_PRE_IMPLEMENTATION_AUDIT.md`).
- **Core Foundation**: Created `/apps/cctv-edge-agent/src/core/` and initialized `AgentCore.ts` as the service entry point.
- **IP Camera Support**: Architecture prepared for RTSP/ONVIF integration within the `core/camera/` module.
- **AI/Detection**: Prepared infrastructure for local person tracking and door-crossing logic within `core/detection/`.

## 4. Operational Requirements (Pending/Gap)
- Integration of a native camera stream handling library (e.g., `ffmpeg-stream` or native bindings) is required for physical RTSP stream processing.
- Implementation of the actual person-detection/tracking algorithm (OpenCV/TensorFlow) needs hardware-accelerated local model deployment.

## 5. Next Steps
1. Implement the RTSP connection manager in `core/camera/`.
2. Implement local SQLite buffering in `core/storage/`.
3. Integrate person detection and door-line logic in `core/detection/`.
4. Finalize the cloud synchronization protocol in `core/sync/` for idempotent event uploads.
