# ENKAI LODGEFLOW — SIDEBAR MENU ARCHITECTURE & PORTAL ALLOCATION REPORT

**Date**: November 9, 2026  
**System**: ENKAI LODGEFLOW Multi-Tenant Lodge Management & AI CCTV Intelligence Platform  
**Scope**: Complete Sidebar Navigation & Portal Menu Allocation Audit

---

## Executive Summary

ENKAI LODGEFLOW is architected as an enterprise-grade multi-tenant platform comprising three distinct operational portals, each with a tailored sidebar navigation (sidecar) designed for its specific user persona (Lodge Staff/Manager, Platform Administrator, and On-Premise CCTV Edge Agent). 

This report provides the exact inventory of menu items allocated to each portal, their functional purpose, and the architectural justification for their placement.

---

## 1. Lodge Management Portal (`Lodge Mode`)
*Target Users*: Front Desk Receptionists, Cashiers, Lodge Managers, Housekeeping Supervisors, and Branch Staff.  
*Focus*: Daily hotel operations, front-desk check-ins, guest management, billing, room inventory, and CCTV intelligence alerts.

| Order | Menu Label | Route ID | Icon | Functional Scope & Allocation Rationale |
|---|---|---|---|---|
| 1 | Dashboard | `dashboard` | `Home` | Central operational overview, occupancy stats, live preview, and recent alerts. |
| 2 | Reservations | `reservations` | `Calendar` | Booking management, upcoming arrivals, stay extensions, and pre-checkins. |
| 3 | Guest Directory | `guests` | `Users` | Registered guest profiles, contact details, and identification records. |
| 4 | Check-In / Out | `checkin` | `CheckCircle2` | Front desk check-in/out workflows enforcing zero-automatic-checkout governance. |
| 5 | Room Management | `rooms` | `BedDouble` | Room inventory, categories, floor distribution, capacity, and pricing. |
| 6 | Housekeeping | `housekeeping` | `Layers` | Cleaning schedules, dirty/clean status updates, and inspection logs. |
| 7 | Reception & Cashier | `reception` | `CreditCard` | Front counter cash/card transactions, shift handovers, and cash drawer management. |
| 8 | Invoices & Billing | `billing` | `Receipt` | Guest folios, tax calculations, payment receipts, and outstanding balance tracking. |
| 9 | Lodge Expenses | `expenses` | `FileSpreadsheet` | Operating expenses, supplier bills, and petty cash logs. |
| 10 | Staff Management | `staff` | `User` | Employee directory, roles, shift schedules, and badge/biometric IDs. |
| 11 | CCTV Intelligence | `cctv-intelligence` | `Video` | AI-powered room entry/exit anomaly detection and person tracking. |
| 12 | Revenue Investigation | `revenue-investigation` | `AlertTriangle` | Unmatched entries, unverified occupancy alerts, and revenue leakage reviews. |
| 13 | CCTV Monitoring | `monitoring` | `Video` | Live camera stream surveillance across corridors and common areas. |
| 14 | Video Analysis Studio | `analysis` | `PlayCircle` | Upload CCTV clips for Gemini multimodal AI video analysis and event extraction. |
| 15 | Room Activity | `activity` | `BedDouble` | Real-time occupancy state per room across floors. |
| 16 | Event Timeline | `timeline` | `Clock` | Chronological audit trail of all entry, exit, and pass-through events. |
| 17 | Room Handover | `handover` | `CheckCircle2` | Shift change room key accountability logs. |
| 18 | Reports & Analytics | `reports` | `BarChart3` | Occupancy trends, financial summaries, and CCTV accuracy metrics. |
| 19 | Branch & Admin | `admin` | `Settings` | Branch-level settings, permissions, and localized configurations. |
| 20 | Settings | `settings` | `Sliders` | Lodge properties, tax rules, receipt formatting, and general preferences. |

---

## 2. Platform Management Portal (`Platform Mode`)
*Target Users*: ENKAI Super Administrators, Enterprise Owners, and Multi-Branch Corporate Directors.  
*Focus*: Tenant provisioning, multi-branch hierarchies, global device registries, edge agent management, AI cost governance, and security auditing.

| Order | Menu Label | Route ID | Icon | Functional Scope & Allocation Rationale |
|---|---|---|---|---|
| 1 | Platform Dashboard | `platform-dashboard` | `Home` | High-level SaaS metrics, total active tenants, global camera health, and aggregate revenue. |
| 2 | Tenant Management | `platform-tenants` | `Building` | Register, suspend, and configure independent lodge businesses (tenants). |
| 3 | Branch Directory | `platform-branches` | `MapPin` | Multi-location branch mappings across cities, regions, and timezones. |
| 4 | CCTV Device Registry | `platform-devices` | `Video` | Global inventory of physical IP cameras mapped to tenants, branches, and rooms. |
| 5 | CCTV Agents | `platform-agents` | `Cpu` | Edge device nodes, local buffer status, offline sync health, and software versions. |
| 6 | AI Usage & Costs | `platform-ai` | `BarChart3` | Gemini API call volumes, token consumption, model fallback stats, and quota monitoring. |
| 7 | Platform Audit Logs | `platform-audit` | `ShieldAlert` | Cross-tenant administrative action logs, security events, and compliance audit trails. |

---

## 3. CCTV Edge Agent Portal (`Agent Mode`)
*Target Users*: On-Premise System Installers, Hardware Technicians, and Edge Node Operators.  
*Focus*: Local RTSP camera connections, local SQLite event buffering, offline synchronization, and edge Gemini processing.

| Order | Menu Label | Route ID | Icon | Functional Scope & Allocation Rationale |
|---|---|---|---|---|
| 1 | CCTV Agent Node | `agent-config` | `Cpu` | Local hardware node status, IP camera bindings, local SQLite buffer, and cloud sync status. |
| 2 | Local Stream Streams | `monitoring` | `Video` | Local CCTV RTSP stream health and camera feed diagnostics. |
| 3 | Edge Video Analysis | `analysis` | `PlayCircle` | Local video clip processing, Gemini edge inferences, and pending upload queue. |

---

## Conclusion
The sidebar allocation strictly separates operational PMS workflows (Lodge Portal), enterprise SaaS administration (Platform Portal), and on-premise hardware node management (Agent Portal), ensuring clean separation of concerns and role-based access control.
