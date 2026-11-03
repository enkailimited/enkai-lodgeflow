/**
 * ENKAI LODGEFLOW - Core Type Definitions
 * Covers:
 * 1. Gemini Multimodal Video Analysis Structured Schema
 * 2. Doorway & Camera Configuration
 * 3. Deterministic Occupancy & Duration Engine
 * 4. Room Handover Lifecycle State Machine
 * 5. Extensible Guest & Staff Identity / Biometric Retention Interfaces
 */

export type EventType = 'ENTRY' | 'EXIT' | 'RE_ENTRY' | 'CORRIDOR_PASS' | 'UNKNOWN';

export type VerificationStatus = 'CONFIRMED' | 'UNVERIFIED' | 'UNCERTAIN';

export type CameraAngleType =
  | 'CORRIDOR_OBLIQUE'
  | 'DIRECT_DOORWAY'
  | 'OVERHEAD_DOWNWARD'
  | 'WIDE_ANGLE_HALLWAY';

export type DoorwayPosition = 'LEFT_WALL' | 'RIGHT_WALL' | 'CENTER_BACK' | 'CUSTOM_ROI';

export type InsideDirection =
  | 'INTO_LEFT_DOOR'
  | 'INTO_RIGHT_DOOR'
  | 'INTO_CENTER_DEPTH'
  | 'TOP_OF_FRAME'
  | 'BOTTOM_OF_FRAME';

export interface DoorwayConfig {
  roomId: string;
  cameraId: string;
  registeredGuestCount: number;
  initialOccupancyBeforeVideo: number;
  cameraAngle: CameraAngleType;
  doorwayPosition: DoorwayPosition;
  insideDirection: InsideDirection;
  /** Normalized threshold box [x%, y%, width%, height%] on video frame */
  thresholdZone: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Optional real-world ISO start time of the recording if known; if empty, uses relative video time unless Gemini reads an on-screen OSD timestamp */
  recordingStartIso?: string;
  customNotes?: string;
}

/**
 * Exact Schema requested in Section 8 for Gemini Video Analysis Output
 */
export interface GeminiEventItem {
  event_id: string;
  person_id: string;
  event_type: EventType;
  video_timestamp: string; // e.g., "00:00:15"
  confidence: number; // 0.0 to 1.0
  verification_status: VerificationStatus;
  direction_established: boolean;
  crossed_doorway_threshold: boolean;
  appearance_descriptor?: string; // Non-biometric anonymous visual descriptor e.g. "Dark jacket, carry-on bag"
  evidence_description: string;
}

export interface GeminiUnverifiedEventItem {
  event_id: string;
  person_id: string;
  video_timestamp: string;
  reason_unverified: string;
  confidence: number;
  evidence_description: string;
}

export interface GeminiOccupancyRaw {
  current_count: number;
  peak_count: number;
  total_entries: number;
  total_exits: number;
}

export interface GeminiVideoAnalysisResponse {
  room_id: string;
  video_duration_seconds: number;
  detected_osd_real_timestamp?: string | null;
  analysis_summary: string;
  events: GeminiEventItem[];
  occupancy: GeminiOccupancyRaw;
  unverified_events: GeminiUnverifiedEventItem[];
  analysis_limitations: string[];
  camera_angle_assessment?: string;
  video_quality_assessment?: string;
}

/**
 * Deterministic Engine Enriched Types (Sections 5, 6, 7)
 */
export interface EnrichedRoomEvent extends GeminiEventItem {
  room_id: string;
  camera_id: string;
  timestamp_seconds: number;
  formatted_relative_time: string;
  /** Populated in Africa/Dar_es_Salaam timezone ONLY when actual recording clock time is known/detected */
  dar_es_salaam_clock_time: string | null;
  occupancy_after_event: number;
  occupancy_delta: number;
  is_duplicate_ignored: boolean;
  engine_note: string;
}

export interface PersonStayDuration {
  stay_id: string;
  person_id: string;
  entry_event_id: string;
  exit_event_id: string | null;
  entry_video_timestamp: string;
  exit_video_timestamp: string | null;
  entry_dar_es_salaam_time: string | null;
  exit_dar_es_salaam_time: string | null;
  duration_seconds: number | null;
  formatted_duration: string; // e.g. "00h 01m 15s" or "03h 25m" or "Still Inside"
  is_re_entry: boolean;
  identity_confidence_note: string;
}

export interface TemporaryVacantPeriod {
  period_id: string;
  vacated_at_video_timestamp: string;
  reoccupied_at_video_timestamp: string | null;
  vacated_dar_es_salaam_time: string | null;
  reoccupied_dar_es_salaam_time: string | null;
  duration_seconds: number | null;
  formatted_duration: string;
}

export interface DeterministicOccupancyMetrics {
  room_id: string;
  camera_id: string;
  registered_guest_count: number;
  initial_occupancy: number;
  current_count: number;
  peak_count: number;
  total_entries: number;
  total_exits: number;
  re_entry_count: number;
  corridor_pass_count: number;
  unverified_event_count: number;
  duplicate_events_filtered: number;
  temporary_vacant_periods: TemporaryVacantPeriod[];
  person_stays: PersonStayDuration[];
  active_occupants: string[];
  occupancy_discrepancy_warning: string | null;
}

export interface FullAnalysisResult {
  analysis_id: string;
  analyzed_at_iso: string;
  analyzed_at_dar_es_salaam: string;
  model_used: string;
  upload_method: 'GEMINI_FILES_API' | 'INLINE_BASE64';
  video_metadata: {
    filename: string;
    mime_type: string;
    size_bytes: number;
    client_duration_seconds: number;
  };
  doorway_config: DoorwayConfig;
  gemini_raw: GeminiVideoAnalysisResponse;
  deterministic_metrics: DeterministicOccupancyMetrics;
  enriched_events: EnrichedRoomEvent[];
}

/**
 * Section 10: Room Handover Lifecycle States
 */
export type RoomLifecycleState =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'CHECKED_IN'
  | 'OCCUPIED'
  | 'TEMPORARILY_VACANT'
  | 'CHECKOUT_PENDING'
  | 'HANDED_OVERCLEANING'
  | 'HANDED_OVER'
  | 'CLEANING';

export interface RoomHandoverAuditLog {
  id: string;
  timestamp_dar_es_salaam: string;
  previous_state: RoomLifecycleState;
  new_state: RoomLifecycleState;
  triggered_by: 'STAFF_AUTHORIZED' | 'CCTV_OCCUPANCY_SIGNAL';
  actor_name: string;
  notes: string;
}

export interface RoomStateRecord {
  room_id: string;
  lifecycle_state: RoomLifecycleState;
  registered_guests: number;
  cctv_current_occupancy: number;
  last_cctv_sync_dar_es_salaam: string | null;
  active_session_id: string | null;
  check_in_dar_es_salaam: string | null;
  checkout_confirmed_dar_es_salaam: string | null;
  staff_handover_verified: boolean;
  audit_trail: RoomHandoverAuditLog[];
}

/**
 * Section 11: Extensible Interfaces for Future Identity & Biometric Governance
 */
export type IdentityVerificationAlternative =
  | 'BIOMETRIC_OPT_IN'
  | 'DECLINED_KEYCARD_AND_PIN'
  | 'DECLINED_STAFF_VISUAL_CHECK'
  | 'ANONYMOUS_SESSION_TRACKING';

export interface GuestFaceReference {
  reference_id: string;
  room_session_id: string;
  room_id: string;
  anonymous_guest_label: string; // e.g., "Registered Guest 1 (Room-101)"
  consent_obtained: boolean;
  consent_timestamp_dar_es_salaam: string | null;
  verification_mode: IdentityVerificationAlternative;
  captured_at_check_in_iso: string | null;
  checkout_confirmed_at_iso: string | null;
  /** Strictly 24 hours after confirmed checkout */
  scheduled_purge_at_iso: string | null;
  retention_status: 'ACTIVE_SESSION' | 'POST_CHECKOUT_24H_WINDOW' | 'PURGED_COMPLETE' | 'BIOMETRIC_DECLINED_BY_GUEST';
  artifacts_status: {
    original_photograph_purged: boolean;
    biometric_template_purged: boolean;
    derived_face_crops_purged: boolean;
    cached_copies_purged: boolean;
  };
}

export interface StaffFaceReference {
  staff_id: string;
  full_name: string;
  role: 'HOUSEKEEPING' | 'FRONT_DESK' | 'SECURITY' | 'DUTY_MANAGER' | 'MAINTENANCE';
  branch_id: string;
  enrolled_by_admin_id: string;
  enrolled_at_dar_es_salaam: string;
  access_control_tier: 'RBAC_ENCRYPTED_L2' | 'RBAC_ENCRYPTED_L3';
  template_encryption_status: 'AES_256_GCM_ACTIVE' | 'REVOKED';
  active: boolean;
}

/**
 * PHASE 0.3: Human-Verified Ground Truth & Accuracy Validation Types
 */
export interface HumanGroundTruthEvent {
  expected_id: string;
  person_id: string; // e.g., "PERSON-A", "PERSON-B", or "ANY"
  event_type: EventType;
  video_timestamp: string; // "HH:MM:SS"
  notes?: string;
}

export interface HumanGroundTruthSpec {
  recorded_by_operator: string;
  recorded_at_dar_es_salaam: string;
  timestamp_tolerance_seconds: number;
  expected_initial_occupancy: number;
  expected_current_occupancy: number;
  expected_peak_occupancy: number;
  expected_total_entries: number;
  expected_total_exits: number;
  expected_events: HumanGroundTruthEvent[];
}

export interface EventComparisonMatch {
  match_type: 'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'FALSE_NEGATIVE';
  expected_event: HumanGroundTruthEvent | null;
  detected_event: EnrichedRoomEvent | null;
  timestamp_delta_seconds: number | null;
  explanation: string;
}

export interface OccupancyCalculationDiff {
  metric_name: string;
  human_ground_truth: number;
  gemini_raw_output: number;
  deterministic_engine_output: number;
  gemini_vs_human_delta: number;
  engine_vs_human_delta: number;
  gemini_vs_engine_delta: number;
  exact_engine_match: boolean;
}

export interface AccuracyValidationReport {
  validation_id: string;
  evaluated_at_dar_es_salaam: string;
  analysis_id: string;
  video_filename: string;
  human_ground_truth: HumanGroundTruthSpec;
  expected_event_count: number;
  detected_event_count: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  /** Null if TP + FP === 0; otherwise 0.0 to 1.0 */
  event_precision: number | null;
  event_precision_display: string;
  /** Null if TP + FN === 0; otherwise 0.0 to 1.0 */
  event_recall: number | null;
  event_recall_display: string;
  event_f1_display: string;
  event_matches: EventComparisonMatch[];
  occupancy_differences: OccupancyCalculationDiff[];
  overall_occupancy_exact_match: boolean;
  confidence_disclaimer: string;
}

export interface Phase03ExecutedTestRecord {
  test_id: string;
  test_title: string;
  executed_at_dar_es_salaam: string;
  video_filename: string;
  video_duration_seconds: number;
  model_used: string;
  gemini_raw_output: GeminiVideoAnalysisResponse;
  deterministic_engine_output: DeterministicOccupancyMetrics;
  human_ground_truth: HumanGroundTruthSpec;
  accuracy_report: AccuracyValidationReport;
}

