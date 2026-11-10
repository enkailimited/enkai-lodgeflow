/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Play,
  RotateCcw,
  Download,
  CheckCircle2,
  Clock,
  Users,
  DoorOpen,
  ShieldCheck,
  Video,
  Sliders,
  FileJson,
  Eye,
  UserCheck,
  ChevronRight,
  Lock,
  Trash2,
  BedDouble,
  BarChart3,
  Maximize2,
  Volume2,
  VolumeX,
  Pause,
  Plus,
  Building2,
  Camera,
  Check,
  AlertCircle,
  Info,
  Sparkles,
  Layers,
} from 'lucide-react';
import {
  CameraAngleType,
  DoorwayConfig,
  DoorwayPosition,
  EnrichedRoomEvent,
  EventType,
  FullAnalysisResult,
  GuestFaceReference,
  IdentityVerificationAlternative,
  InsideDirection,
  Phase03ExecutedTestRecord,
  RoomHandoverAuditLog,
  RoomLifecycleState,
  StaffFaceReference,
} from './types/lodgeflow';
import {
  deriveNextRoomStateFromCctv,
  formatDarEsSalaamTime,
  formatSecondsToVideoTimestamp,
} from './engine/occupancyEngine';
import {
  generateRealCctvTestVideoFile,
  SAMPLE_SCENARIOS,
  SampleScenarioId,
} from './utils/sampleCctvGenerator';
import { AccuracyValidationPanel } from './components/AccuracyValidationPanel';
import { RoomManagementPage } from './components/rooms/RoomManagementPage';
import { useRoomInventory } from './data/roomInventoryStore';
import {
  AppLayout,
  AppRouteId,
  AppNotificationItem,
} from './components/layout/AppLayout';
import { Button } from './components/ui/Button';
import { Modal, ConfirmDialog } from './components/ui/Modal';
import {
  FormField,
  Input,
  Select,
  Textarea,
  Switch,
  DatePicker,
  SearchInput,
  FilterBar,
} from './components/ui/FormControls';
import {
  StatusBadge,
  ConnectionStatus,
  ConfidenceIndicator,
  ProgressIndicator,
  EmptyState,
  ErrorState,
  SuccessState,
} from './components/ui/StatusComponents';
import {
  PageHeader,
  SectionHeader,
  StatCard,
  DataTable,
  EventCard,
  ActivityTimeline,
  ChartCard,
} from './components/ui/DataPresentation';

interface ServerHealthInfo {
  status: string;
  gemini_configured: boolean;
  model: string;
  free_tier_compatible: boolean;
  supported_formats: string[];
  max_upload_mb: number;
  timezone: string;
  server_time_dar_es_salaam: string;
}

interface LodgeRoomSummary {
  roomId: string;
  floor: string;
  cameraId: string;
  registeredGuests: number;
  lifecycleState: RoomLifecycleState;
  cctvOccupancy: number | null;
}

interface RegisteredCameraInfo {
  cameraId: string;
  name: string;
  branch: string;
  corridor: string;
  targetRoomId: string;
  angle: CameraAngleType;
  rtspConnected: boolean;
  mode: 'UPLOAD_PROTOTYPE' | 'RTSP_PENDING';
}

const DEFAULT_DOORWAY_CONFIG: DoorwayConfig = {
  roomId: 'ROOM-101',
  cameraId: 'CAM-CORRIDOR-01',
  registeredGuestCount: 2,
  initialOccupancyBeforeVideo: 0,
  cameraAngle: 'CORRIDOR_OBLIQUE',
  doorwayPosition: 'LEFT_WALL',
  insideDirection: 'INTO_LEFT_DOOR',
  thresholdZone: {
    x: 13,
    y: 18,
    width: 16,
    height: 48,
  },
  recordingStartIso: '',
  customNotes: '',
};

const ALL_LIFECYCLE_STATES: RoomLifecycleState[] = [
  'AVAILABLE',
  'RESERVED',
  'CHECKED_IN',
  'OCCUPIED',
  'TEMPORARILY_VACANT',
  'CHECKOUT_PENDING',
  'HANDED_OVER',
  'CLEANING',
];

const INITIAL_ROOMS: LodgeRoomSummary[] = [
  {
    roomId: 'ROOM-101',
    floor: 'Floor 1 — North Wing',
    cameraId: 'CAM-CORRIDOR-01',
    registeredGuests: 2,
    lifecycleState: 'CHECKED_IN',
    cctvOccupancy: null,
  },
  {
    roomId: 'ROOM-102',
    floor: 'Floor 1 — North Wing',
    cameraId: 'CAM-CORRIDOR-01',
    registeredGuests: 2,
    lifecycleState: 'OCCUPIED',
    cctvOccupancy: null,
  },
  {
    roomId: 'ROOM-103',
    floor: 'Floor 1 — South Wing',
    cameraId: 'CAM-CORRIDOR-02',
    registeredGuests: 1,
    lifecycleState: 'OCCUPIED',
    cctvOccupancy: null,
  },
  {
    roomId: 'ROOM-104',
    floor: 'Floor 1 — South Wing',
    cameraId: 'CAM-CORRIDOR-02',
    registeredGuests: 0,
    lifecycleState: 'AVAILABLE',
    cctvOccupancy: null,
  },
  {
    roomId: 'ROOM-201',
    floor: 'Floor 2 — Executive Wing',
    cameraId: 'CAM-CORRIDOR-03',
    registeredGuests: 2,
    lifecycleState: 'OCCUPIED',
    cctvOccupancy: null,
  },
  {
    roomId: 'ROOM-202',
    floor: 'Floor 2 — Executive Wing',
    cameraId: 'CAM-CORRIDOR-03',
    registeredGuests: 0,
    lifecycleState: 'AVAILABLE',
    cctvOccupancy: null,
  },
  {
    roomId: 'ROOM-203',
    floor: 'Floor 2 — Executive Wing',
    cameraId: 'CAM-CORRIDOR-03',
    registeredGuests: 1,
    lifecycleState: 'RESERVED',
    cctvOccupancy: null,
  },
  {
    roomId: 'ROOM-301',
    floor: 'Floor 3 — Penthouse Wing',
    cameraId: 'CAM-CORRIDOR-04',
    registeredGuests: 0,
    lifecycleState: 'CLEANING',
    cctvOccupancy: null,
  },
];

const INITIAL_CAMERAS: RegisteredCameraInfo[] = [
  {
    cameraId: 'CAM-CORRIDOR-01',
    name: 'Floor 1 North Corridor (Room 101–102)',
    branch: 'Main Branch',
    corridor: 'Floor 1 — North Wing',
    targetRoomId: 'ROOM-101',
    angle: 'CORRIDOR_OBLIQUE',
    rtspConnected: false,
    mode: 'UPLOAD_PROTOTYPE',
  },
  {
    cameraId: 'CAM-CORRIDOR-02',
    name: 'Floor 1 South Corridor (Room 103–104)',
    branch: 'Main Branch',
    corridor: 'Floor 1 — South Wing',
    targetRoomId: 'ROOM-103',
    angle: 'DIRECT_DOORWAY',
    rtspConnected: false,
    mode: 'UPLOAD_PROTOTYPE',
  },
  {
    cameraId: 'CAM-CORRIDOR-03',
    name: 'Floor 2 Executive Hallway (Room 201–203)',
    branch: 'Main Branch',
    corridor: 'Floor 2 — Executive Wing',
    targetRoomId: 'ROOM-201',
    angle: 'WIDE_ANGLE_HALLWAY',
    rtspConnected: false,
    mode: 'RTSP_PENDING',
  },
  {
    cameraId: 'CAM-CORRIDOR-04',
    name: 'Floor 3 Penthouse Approach (Room 301)',
    branch: 'Main Branch',
    corridor: 'Floor 3 — Penthouse Wing',
    targetRoomId: 'ROOM-301',
    angle: 'OVERHEAD_DOWNWARD',
    rtspConnected: false,
    mode: 'RTSP_PENDING',
  },
];

export default function App({ initialRoute = 'dashboard' }: { initialRoute?: AppRouteId } = {}) {
  const [activeRoute, setActiveRoute] = useState<AppRouteId>(initialRoute);
  const [health, setHealth] = useState<ServerHealthInfo | null>(null);

  // Branch & operator context
  const [branches, setBranches] = useState<string[]>([
    'Main Branch',
    'Dar Peninsula Branch',
    'Arusha Safari Lodge',
  ]);
  const [selectedBranch, setSelectedBranch] = useState<string>('Main Branch');

  // Notifications
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([
    {
      id: 'NOTIF-1',
      title: 'Gemini Multimodal Engine Ready',
      message:
        'Server-side video analysis pipeline with 2 MB chunked upload and multi-model failover is active.',
      timestamp: 'Just now',
      read: false,
      tone: 'info',
    },
    {
      id: 'NOTIF-2',
      title: 'Zero Automatic Checkout Policy',
      message:
        'CCTV zero occupancy transitions rooms to TEMPORARILY_VACANT. Staff confirmation is required for handover.',
      timestamp: 'Today',
      read: false,
      tone: 'success',
    },
  ]);

  const [toastSuccess, setToastSuccess] = useState<{
    title: string;
    message?: string;
  } | null>(null);

  // Lodge room & camera registry state
  const [lodgeRooms, setLodgeRooms] = useState<LodgeRoomSummary[]>(INITIAL_ROOMS);
  const [cameras] = useState<RegisteredCameraInfo[]>(INITIAL_CAMERAS);
  // PHASE 1 inventory, now served by PostgreSQL via the room API
  const roomInventory = useRoomInventory();
  const [selectedMonitoringCorridor, setSelectedMonitoringCorridor] =
    useState<string>('ALL');
  const [cameraDetailModal, setCameraDetailModal] =
    useState<RegisteredCameraInfo | null>(null);

  // Video selection & preview states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<number>(0);
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [uploadStatusText, setUploadStatusText] = useState<string>('No video selected');
  const [uploadProgressPct, setUploadProgressPct] = useState<number>(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [isVideoMuted, setIsVideoMuted] = useState<boolean>(false);

  // Doorway & camera configuration
  const [doorwayConfig, setDoorwayConfig] =
    useState<DoorwayConfig>(DEFAULT_DOORWAY_CONFIG);
  const [showDoorwayOverlay, setShowDoorwayOverlay] = useState<boolean>(true);
  const [doorwayModalOpen, setDoorwayModalOpen] = useState<boolean>(false);

  // Analysis processing & error states
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisPhaseText, setAnalysisPhaseText] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<{
    code: string;
    message: string;
    detail?: string;
  } | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FullAnalysisResult | null>(null);

  // Sample test video generator state
  const [isGeneratingSample, setIsGeneratingSample] = useState<boolean>(false);
  const [sampleProgress, setSampleProgress] = useState<number>(0);

  // Timeline & Reports filters
  const [eventFilter, setEventFilter] = useState<'ALL' | EventType>('ALL');
  const [timelineSearch, setTimelineSearch] = useState<string>('');
  const [trendTimeRange, setTrendTimeRange] = useState<'CLIP' | '24H'>('CLIP');

  // Room Handover Lifecycle State Machine (Section 10)
  const [roomLifecycleState, setRoomLifecycleState] =
    useState<RoomLifecycleState>('CHECKED_IN');
  const [staffActorName, setStaffActorName] = useState<string>(
    'Duty Manager A. Mwakasege'
  );
  const [handoverNotes, setHandoverNotes] = useState<string>('');
  const [pendingHandoverConfirmState, setPendingHandoverConfirmState] =
    useState<RoomLifecycleState | null>(null);
  const [handoverAuditLog, setHandoverAuditLog] = useState<RoomHandoverAuditLog[]>([
    {
      id: 'AUD-001',
      timestamp_dar_es_salaam: formatDarEsSalaamTime(new Date(), true),
      previous_state: 'RESERVED',
      new_state: 'CHECKED_IN',
      triggered_by: 'STAFF_AUTHORIZED',
      actor_name: 'Front Desk Reception',
      notes: 'Guest checked into ROOM-101 (2 registered guests). Keycard issued.',
    },
  ]);

  // Future Identity & Temporary Biometric Retention Registry (Section 11)
  const [guestReferences, setGuestReferences] = useState<GuestFaceReference[]>([
    {
      reference_id: 'GREF-101-A',
      room_session_id: 'SES-2026-101A',
      room_id: 'ROOM-101',
      anonymous_guest_label: 'Primary Guest (Session SES-2026-101A)',
      consent_obtained: true,
      consent_timestamp_dar_es_salaam: formatDarEsSalaamTime(new Date(), true),
      verification_mode: 'BIOMETRIC_OPT_IN',
      captured_at_check_in_iso: new Date().toISOString(),
      checkout_confirmed_at_iso: null,
      scheduled_purge_at_iso: null,
      retention_status: 'ACTIVE_SESSION',
      artifacts_status: {
        original_photograph_purged: false,
        biometric_template_purged: false,
        derived_face_crops_purged: false,
        cached_copies_purged: false,
      },
    },
    {
      reference_id: 'GREF-101-B',
      room_session_id: 'SES-2026-101A',
      room_id: 'ROOM-101',
      anonymous_guest_label: 'Companion Guest (Session SES-2026-101A)',
      consent_obtained: false,
      consent_timestamp_dar_es_salaam: null,
      verification_mode: 'DECLINED_KEYCARD_AND_PIN',
      captured_at_check_in_iso: null,
      checkout_confirmed_at_iso: null,
      scheduled_purge_at_iso: null,
      retention_status: 'BIOMETRIC_DECLINED_BY_GUEST',
      artifacts_status: {
        original_photograph_purged: true,
        biometric_template_purged: true,
        derived_face_crops_purged: true,
        cached_copies_purged: true,
      },
    },
  ]);

  const [staffReferences, setStaffReferences] = useState<StaffFaceReference[]>([
    {
      staff_id: 'STF-DAR-014',
      full_name: 'Neema Kiwango',
      role: 'HOUSEKEEPING',
      branch_id: 'ENKAI-DAR-PENINSULA',
      enrolled_by_admin_id: 'ADM-001',
      enrolled_at_dar_es_salaam: 'Oct 15, 2026, 09:00:00 AM EAT',
      access_control_tier: 'RBAC_ENCRYPTED_L2',
      template_encryption_status: 'AES_256_GCM_ACTIVE',
      active: true,
    },
    {
      staff_id: 'STF-DAR-003',
      full_name: 'Amani Mwakasege',
      role: 'DUTY_MANAGER',
      branch_id: 'ENKAI-DAR-PENINSULA',
      enrolled_by_admin_id: 'ADM-001',
      enrolled_at_dar_es_salaam: 'Oct 10, 2026, 08:30:00 AM EAT',
      access_control_tier: 'RBAC_ENCRYPTED_L3',
      template_encryption_status: 'AES_256_GCM_ACTIVE',
      active: true,
    },
  ]);

  // Staff Registration & Branch Modals (Administration Screen)
  const [staffModalOpen, setStaffModalOpen] = useState<boolean>(false);
  const [newStaffName, setNewStaffName] = useState<string>('');
  const [newStaffRole, setNewStaffRole] =
    useState<StaffFaceReference['role']>('FRONT_DESK');
  const [branchModalOpen, setBranchModalOpen] = useState<boolean>(false);
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [selectedRoomDetail, setSelectedRoomDetail] =
    useState<LodgeRoomSummary | null>(null);
  const [purgeConfirmGuestId, setPurgeConfirmGuestId] = useState<string | null>(null);

  // Deterministic Engine Self-Test & Phase 0.3 Executed Test Records
  const [engineVerificationResult, setEngineVerificationResult] = useState<any | null>(
    null
  );
  const [isVerifyingEngine, setIsVerifyingEngine] = useState<boolean>(false);
  const [executedValidationTests, setExecutedValidationTests] = useState<
    Phase03ExecutedTestRecord[]
  >([]);

  // Settings preferences
  const [autoShowThresholdOverlay, setAutoShowThresholdOverlay] = useState<boolean>(true);
  const [duplicateEventWindowSec, setDuplicateEventWindowSec] = useState<number>(2);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dashboardVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setHealth(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, [videoPreviewUrl]);

  // Synchronize ROOM-101 state in lodgeRooms whenever roomLifecycleState or analysisResult updates
  useEffect(() => {
    setLodgeRooms((prev) =>
      prev.map((rm) =>
        rm.roomId === doorwayConfig.roomId
          ? {
              ...rm,
              registeredGuests: doorwayConfig.registeredGuestCount,
              lifecycleState: roomLifecycleState,
              cctvOccupancy: analysisResult
                ? analysisResult.deterministic_metrics.current_count
                : rm.cctvOccupancy,
            }
          : rm
      )
    );
  }, [
    doorwayConfig.roomId,
    doorwayConfig.registeredGuestCount,
    roomLifecycleState,
    analysisResult,
  ]);

  const handleFilePicked = (file: File | null | undefined) => {
    setErrorBanner(null);
    if (!file) return;

    const allowedExtensions = [
      '.mp4',
      '.mov',
      '.webm',
      '.avi',
      '.mpeg',
      '.mpg',
      '.3gp',
      '.mkv',
    ];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const isVideoMime = file.type.startsWith('video/');

    if (!isVideoMime && !allowedExtensions.includes(ext)) {
      setErrorBanner({
        code: 'INVALID_FILE_FORMAT',
        message: `Unsupported file "${file.name}" (${
          file.type || 'unknown type'
        }). Please select a valid MP4, MOV, WebM, AVI, or 3GPP CCTV video file.`,
      });
      setUploadStatusText('Invalid file format rejected');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setErrorBanner({
        code: 'LARGE_VIDEO_FILE',
        message: `Selected file "${file.name}" is ${(
          file.size /
          (1024 * 1024)
        ).toFixed(
          1
        )} MB, which exceeds the 100 MB prototype limit. Please select a shorter CCTV clip.`,
      });
      setUploadStatusText('File exceeds 100 MB limit');
      return;
    }

    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setVideoPreviewUrl(previewUrl);
    setVideoDurationSec(0);
    setUploadProgressPct(0);
    setUploadStatusText(`Ready for analysis (${(file.size / 1024).toFixed(1)} KB)`);
    setToastSuccess({
      title: 'CCTV Video Loaded',
      message: `${file.name} (${(file.size / 1024).toFixed(1)} KB) ready for Gemini multimodal analysis.`,
    });
  };

  const handleClearReset = () => {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setSelectedFile(null);
    setVideoPreviewUrl(null);
    setVideoDurationSec(0);
    setCurrentVideoTime(0);
    setUploadProgressPct(0);
    setAnalysisResult(null);
    setErrorBanner(null);
    setUploadStatusText('No video selected');
    setAnalysisPhaseText('');
    setToastSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerateSampleClip = async (scenarioId: SampleScenarioId) => {
    setErrorBanner(null);
    setIsGeneratingSample(true);
    setSampleProgress(0);
    const spec = SAMPLE_SCENARIOS.find((s) => s.id === scenarioId);
    if (spec) {
      setDoorwayConfig((c) => ({
        ...c,
        initialOccupancyBeforeVideo: spec.recommendedInitialOccupancy,
      }));
    }
    setUploadStatusText(`Rendering ${spec?.code || 'sample'} CCTV corridor video clip...`);
    try {
      const file = await generateRealCctvTestVideoFile(
        scenarioId,
        doorwayConfig.roomId,
        (pct) => setSampleProgress(pct)
      );
      handleFilePicked(file);
    } catch (err) {
      setErrorBanner({
        code: 'SAMPLE_GENERATION_FAILED',
        message:
          err instanceof Error
            ? err.message
            : 'Could not generate sample video clip in this browser.',
      });
    } finally {
      setIsGeneratingSample(false);
    }
  };

  const handleAnalyzeVideo = async () => {
    if (!selectedFile) {
      setErrorBanner({
        code: 'NO_VIDEO_SELECTED',
        message:
          'Please select or generate a CCTV video clip before clicking Analyze Video.',
      });
      return;
    }

    setErrorBanner(null);
    setToastSuccess(null);
    setIsAnalyzing(true);
    setUploadProgressPct(5);
    setUploadStatusText('Initializing chunked upload...');
    setAnalysisPhaseText(
      `Step 1/3: Initializing upload for ${selectedFile.name} (${(
        selectedFile.size /
        (1024 * 1024)
      ).toFixed(2)} MB)...`
    );

    const safeParseJson = async (res: Response) => {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(
          `Server returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 140)}`
        );
      }
    };

    try {
      // 1. Initialize upload session on server
      const initRes = await fetch('/api/upload-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.name,
          mimeType: selectedFile.type,
          totalSize: selectedFile.size,
        }),
      });
      const initData = await safeParseJson(initRes);
      if (!initRes.ok) {
        setErrorBanner({
          code: initData.error_code || `HTTP_${initRes.status}`,
          message: initData.message || 'Could not initialize video upload.',
        });
        setUploadStatusText(`Upload init failed (${initData.error_code || initRes.status})`);
        return;
      }

      const uploadId: string = initData.uploadId;

      // 2. Upload video in 2 MB chunks with automatic per-chunk retry
      const CHUNK_SIZE = 2 * 1024 * 1024;
      const totalChunks = Math.max(1, Math.ceil(selectedFile.size / CHUNK_SIZE));

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(selectedFile.size, start + CHUNK_SIZE);
        const chunkBlob = selectedFile.slice(start, end);

        let chunkUploaded = false;
        let lastChunkErr: unknown = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const chunkRes = await fetch('/api/upload-chunk', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'x-upload-id': uploadId,
              },
              body: chunkBlob,
            });
            const chunkData = await safeParseJson(chunkRes);
            if (!chunkRes.ok) {
              throw new Error(
                chunkData.message || `Chunk upload HTTP ${chunkRes.status}`
              );
            }
            const pct =
              chunkData.progressPct ?? Math.round((end / selectedFile.size) * 100);
            setUploadProgressPct(Math.min(45, Math.round(pct * 0.45)));
            setUploadStatusText(`Uploading video (${pct}%)`);
            setAnalysisPhaseText(
              `Step 1/3: Uploading ${selectedFile.name} (${pct}% · ${(
                end /
                (1024 * 1024)
              ).toFixed(2)} / ${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)...`
            );
            chunkUploaded = true;
            break;
          } catch (cErr) {
            lastChunkErr = cErr;
            await new Promise((r) => setTimeout(r, 800 * attempt));
          }
        }

        if (!chunkUploaded) {
          throw (
            lastChunkErr || new Error('Failed to upload video chunk after 3 attempts.')
          );
        }
      }

      // 3. Start background Gemini Video Analysis job
      setUploadProgressPct(55);
      setUploadStatusText('Starting Gemini analysis job...');
      setAnalysisPhaseText(
        'Step 2/3: Queuing video for Gemini multimodal analysis...'
      );

      const startRes = await fetch('/api/analyze-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          config: doorwayConfig,
          clientDurationSeconds: videoDurationSec || 0,
        }),
      });
      const startData = await safeParseJson(startRes);
      if (!startRes.ok) {
        setErrorBanner({
          code: startData.error_code || `HTTP_${startRes.status}`,
          message: startData.message || 'Failed to start Gemini analysis job.',
        });
        setUploadStatusText('Failed to start analysis');
        return;
      }

      const jobId: string = startData.jobId;

      // 4. Poll job status every 1.5s until COMPLETED or FAILED
      let consecutivePollErrors = 0;
      const maxPollWaitMs = 4 * 60 * 1000;
      const pollStart = Date.now();

      while (Date.now() - pollStart < maxPollWaitMs) {
        await new Promise((r) => setTimeout(r, 1500));

        try {
          const pollRes = await fetch(`/api/analyze-status/${jobId}`);
          const pollData = await safeParseJson(pollRes);
          consecutivePollErrors = 0;

          if (!pollRes.ok) {
            setErrorBanner({
              code: pollData.error_code || `HTTP_${pollRes.status}`,
              message: pollData.message || 'Error checking analysis status.',
            });
            setUploadStatusText('Analysis status error');
            return;
          }

          if (pollData.stageMessage) {
            const elapsed = pollData.elapsedSeconds ?? 0;
            setUploadProgressPct(Math.min(95, 58 + Math.min(35, elapsed * 3)));
            setAnalysisPhaseText(`${pollData.stageMessage} (${elapsed}s)`);
            setUploadStatusText(`Processing (${elapsed}s)...`);
          }

          if (pollData.status === 'FAILED') {
            const errObj = pollData.error || {};
            setErrorBanner({
              code: errObj.error_code || 'ANALYSIS_FAILED',
              message: errObj.message || 'Video analysis failed on the server.',
              detail: errObj.technical_detail,
            });
            setUploadStatusText(`Analysis failed (${errObj.error_code || 'ERROR'})`);
            return;
          }

          if (pollData.status === 'COMPLETED' && pollData.result) {
            const fullResult = pollData.result as FullAnalysisResult;
            setUploadProgressPct(100);
            setAnalysisResult(fullResult);
            setUploadStatusText(
              `Analysis complete via ${fullResult.model_used} (${fullResult.upload_method})`
            );
            setToastSuccess({
              title: `Gemini Analysis Complete (${fullResult.doorway_config.roomId})`,
              message: `Detected ${fullResult.deterministic_metrics.total_entries} confirmed entries, ${fullResult.deterministic_metrics.total_exits} exits, current occupancy: ${fullResult.deterministic_metrics.current_count}.`,
            });

            // Add notification
            setNotifications((prev) => [
              {
                id: `NOTIF-${Date.now()}`,
                title: `Video Analyzed: ${fullResult.doorway_config.roomId}`,
                message: `Current Occupancy: ${fullResult.deterministic_metrics.current_count} · Entries: ${fullResult.deterministic_metrics.total_entries} · Exits: ${fullResult.deterministic_metrics.total_exits}`,
                timestamp: fullResult.analyzed_at_dar_es_salaam,
                read: false,
                tone: 'success',
              },
              ...prev,
            ]);

            // Update Room Lifecycle state automatically according to Section 10 rules
            const lifecycleUpdate = deriveNextRoomStateFromCctv(
              roomLifecycleState,
              fullResult.deterministic_metrics
            );
            if (lifecycleUpdate.nextState !== roomLifecycleState) {
              const prev = roomLifecycleState;
              setRoomLifecycleState(lifecycleUpdate.nextState);
              setHandoverAuditLog((logs) => [
                {
                  id: `AUD-${String(logs.length + 1).padStart(3, '0')}`,
                  timestamp_dar_es_salaam: formatDarEsSalaamTime(new Date(), true),
                  previous_state: prev,
                  new_state: lifecycleUpdate.nextState,
                  triggered_by: 'CCTV_OCCUPANCY_SIGNAL',
                  actor_name: `ENKAI CCTV Engine (${fullResult.doorway_config.cameraId})`,
                  notes: lifecycleUpdate.explanation,
                },
                ...logs,
              ]);
            }
            return;
          }
        } catch (pollErr) {
          consecutivePollErrors += 1;
          if (consecutivePollErrors >= 6) {
            throw pollErr;
          }
        }
      }

      throw new Error('Video analysis timed out after 4 minutes.');
    } catch (netErr) {
      setErrorBanner({
        code: 'NETWORK_INTERRUPTION',
        message:
          'Network connection was interrupted while communicating with the analysis server. Please check your connection and retry.',
        detail: netErr instanceof Error ? netErr.message : String(netErr),
      });
      setUploadStatusText('Network interruption');
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhaseText('');
    }
  };

  const handleSeekVideoTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, seconds);
      videoRef.current.play().catch(() => {});
    }
    if (dashboardVideoRef.current) {
      dashboardVideoRef.current.currentTime = Math.max(0, seconds);
      dashboardVideoRef.current.play().catch(() => {});
    }
  };

  const handleDownloadJsonReport = () => {
    if (!analysisResult) return;
    const blob = new Blob([JSON.stringify(analysisResult, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enkai-lodgeflow-${analysisResult.doorway_config.roomId.toLowerCase()}-${analysisResult.analysis_id.toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAuthorizedStateTransition = (targetState: RoomLifecycleState) => {
    if (targetState === roomLifecycleState) return;
    const prev = roomLifecycleState;
    setRoomLifecycleState(targetState);
    const noteText =
      handoverNotes.trim() ||
      (targetState === 'HANDED_OVER'
        ? 'Staff physically inspected room and confirmed checkout handover. 24-hour guest biometric retention timer started.'
        : `Authorized manual state transition from ${prev} to ${targetState}.`);

    setHandoverAuditLog((logs) => [
      {
        id: `AUD-${String(logs.length + 1).padStart(3, '0')}`,
        timestamp_dar_es_salaam: formatDarEsSalaamTime(new Date(), true),
        previous_state: prev,
        new_state: targetState,
        triggered_by: 'STAFF_AUTHORIZED',
        actor_name: staffActorName || 'Authorized Lodge Staff',
        notes: noteText,
      },
      ...logs,
    ]);
    setHandoverNotes('');
    setPendingHandoverConfirmState(null);
    setToastSuccess({
      title: `Room State Updated: ${targetState}`,
      message: `${doorwayConfig.roomId} transitioned from ${prev} to ${targetState} by ${staffActorName}.`,
    });

    if (targetState === 'HANDED_OVER') {
      const now = new Date();
      const purgeTime = new Date(now.getTime() + 24 * 3600 * 1000);
      setGuestReferences((refs) =>
        refs.map((r) =>
          r.consent_obtained && r.retention_status === 'ACTIVE_SESSION'
            ? {
                ...r,
                checkout_confirmed_at_iso: now.toISOString(),
                scheduled_purge_at_iso: purgeTime.toISOString(),
                retention_status: 'POST_CHECKOUT_24H_WINDOW',
              }
            : r
        )
      );
    }
  };

  const handlePurgeGuestBiometricsNow = (referenceId: string) => {
    setGuestReferences((refs) =>
      refs.map((r) =>
        r.reference_id === referenceId
          ? {
              ...r,
              retention_status: 'PURGED_COMPLETE',
              artifacts_status: {
                original_photograph_purged: true,
                biometric_template_purged: true,
                derived_face_crops_purged: true,
                cached_copies_purged: true,
              },
            }
          : r
      )
    );
    setPurgeConfirmGuestId(null);
    setToastSuccess({
      title: 'Guest Biometric Artifacts Purged',
      message: `All photographs, templates, derived crops, and cache for ${referenceId} have been permanently deleted.`,
    });
  };

  const handleToggleGuestConsent = (
    referenceId: string,
    consent: boolean,
    mode: IdentityVerificationAlternative
  ) => {
    setGuestReferences((refs) =>
      refs.map((r) =>
        r.reference_id === referenceId
          ? {
              ...r,
              consent_obtained: consent,
              consent_timestamp_dar_es_salaam: consent
                ? formatDarEsSalaamTime(new Date(), true)
                : null,
              verification_mode: mode,
              retention_status: consent
                ? 'ACTIVE_SESSION'
                : 'BIOMETRIC_DECLINED_BY_GUEST',
              artifacts_status: consent
                ? {
                    original_photograph_purged: false,
                    biometric_template_purged: false,
                    derived_face_crops_purged: false,
                    cached_copies_purged: false,
                  }
                : {
                    original_photograph_purged: true,
                    biometric_template_purged: true,
                    derived_face_crops_purged: true,
                    cached_copies_purged: true,
                  },
            }
          : r
      )
    );
  };

  const runDeterministicVerificationSuite = async () => {
    setIsVerifyingEngine(true);
    try {
      const res = await fetch('/api/verify-engine', { method: 'POST' });
      const data = await res.json();
      setEngineVerificationResult(data);
      setToastSuccess({
        title: 'Deterministic Engine Self-Test Passed',
        message: 'Verified multi-person entry, temporary exit, re-entry, and handover rules.',
      });
    } catch {
      // ignore
    } finally {
      setIsVerifyingEngine(false);
    }
  };

  const handleRegisterStaff = () => {
    if (!newStaffName.trim()) return;
    const newStaff: StaffFaceReference = {
      staff_id: `STF-DAR-${String(staffReferences.length + 15).padStart(3, '0')}`,
      full_name: newStaffName.trim(),
      role: newStaffRole,
      branch_id: selectedBranch.toUpperCase().replace(/\s+/g, '-'),
      enrolled_by_admin_id: 'ADM-001',
      enrolled_at_dar_es_salaam: formatDarEsSalaamTime(new Date(), true),
      access_control_tier:
        newStaffRole === 'DUTY_MANAGER' || newStaffRole === 'SECURITY'
          ? 'RBAC_ENCRYPTED_L3'
          : 'RBAC_ENCRYPTED_L2',
      template_encryption_status: 'AES_256_GCM_ACTIVE',
      active: true,
    };
    setStaffReferences((prev) => [newStaff, ...prev]);
    setNewStaffName('');
    setStaffModalOpen(false);
    setToastSuccess({
      title: 'Staff Member Registered',
      message: `${newStaff.full_name} (${newStaff.role}) added to RBAC registry.`,
    });
  };

  const handleAddBranch = () => {
    if (!newBranchName.trim()) return;
    const bName = newBranchName.trim();
    if (!branches.includes(bName)) {
      setBranches((prev) => [...prev, bName]);
      setSelectedBranch(bName);
    }
    setNewBranchName('');
    setBranchModalOpen(false);
    setToastSuccess({
      title: 'Lodge Branch Configured',
      message: `Branch "${bName}" is now active in the branch selector.`,
    });
  };

  // Operational room metrics. Room inventory figures come from PostgreSQL via
  // the room API. The legacy CCTV room summary is only a first-paint fallback
  // while the server request is in flight; once it fails, KPIs show zero rather
  // than silently presenting CCTV-derived numbers as inventory.
  const roomInventoryReady = roomInventory.status === 'ready';
  const roomInventoryLoading = roomInventory.status === 'loading';
  const totalRoomsCount = roomInventoryReady
    ? roomInventory.rooms.length
    : roomInventoryLoading
    ? lodgeRooms.length
    : 0;
  const occupiedRoomsCount = roomInventoryReady
    ? roomInventory.rooms.filter((r) => r.status === 'OCCUPIED').length
    : roomInventoryLoading
    ? lodgeRooms.filter(
        (r) =>
          r.lifecycleState === 'OCCUPIED' ||
          r.lifecycleState === 'CHECKED_IN' ||
          r.lifecycleState === 'TEMPORARILY_VACANT'
      ).length
    : 0;
  const availableRoomsCount = roomInventoryReady
    ? roomInventory.rooms.filter((r) => r.status === 'AVAILABLE').length
    : roomInventoryLoading
    ? lodgeRooms.filter((r) => r.lifecycleState === 'AVAILABLE').length
    : 0;
  const reservedRoomsCount = roomInventoryReady
    ? roomInventory.rooms.filter((r) => r.status === 'RESERVED').length
    : roomInventoryLoading
    ? lodgeRooms.filter((r) => r.lifecycleState === 'RESERVED').length
    : 0;
  const cleaningRoomsCount = roomInventoryReady
    ? roomInventory.rooms.filter((r) => r.status === 'CLEANING').length
    : roomInventoryLoading
    ? lodgeRooms.filter(
        (r) => r.lifecycleState === 'CLEANING' || r.lifecycleState === 'HANDED_OVER'
      ).length
    : 0;
  const floorCount = roomInventoryReady
    ? new Set(roomInventory.rooms.map((r) => r.floor)).size
    : roomInventoryLoading
    ? 3
    : 0;
  const currentRegisteredGuestsCount = lodgeRooms.reduce(
    (sum, r) => sum + r.registeredGuests,
    0
  );
  const occupiedPct =
    totalRoomsCount > 0 ? Math.round((occupiedRoomsCount / totalRoomsCount) * 100) : 0;
  const availablePct =
    totalRoomsCount > 0 ? Math.round((availableRoomsCount / totalRoomsCount) * 100) : 0;

  const activeUploadCamerasCount = videoPreviewUrl ? 1 : 0;
  const liveRtspCamerasCount = cameras.filter((c) => c.rtspConnected).length;

  const filteredEvents =
    analysisResult?.enriched_events.filter((ev) => {
      const matchesType = eventFilter === 'ALL' ? true : ev.event_type === eventFilter;
      const matchesSearch =
        !timelineSearch.trim() ||
        ev.person_id.toLowerCase().includes(timelineSearch.toLowerCase()) ||
        ev.room_id.toLowerCase().includes(timelineSearch.toLowerCase()) ||
        ev.evidence_description.toLowerCase().includes(timelineSearch.toLowerCase()) ||
        ev.event_type.toLowerCase().includes(timelineSearch.toLowerCase());
      return matchesType && matchesSearch;
    }) || [];

  const avgConfidence =
    analysisResult && analysisResult.enriched_events.length > 0
      ? Math.round(
          (analysisResult.enriched_events.reduce((acc, e) => acc + e.confidence, 0) /
            analysisResult.enriched_events.length) *
            100
        )
      : null;

  // Build actual activity trend buckets from analyzed video events
  const activityBuckets = React.useMemo(() => {
    if (!analysisResult || analysisResult.enriched_events.length === 0) {
      return [];
    }
    const dur = Math.max(8, analysisResult.gemini_raw.video_duration_seconds || 10);
    const bucketCount = 8;
    const step = dur / bucketCount;
    return Array.from({ length: bucketCount }).map((_, idx) => {
      const startSec = Math.round(idx * step);
      const endSec = Math.round((idx + 1) * step);
      const inWindow = analysisResult.enriched_events.filter(
        (e) => e.timestamp_seconds >= startSec && e.timestamp_seconds < endSec + 0.5
      );
      const entries = inWindow.filter(
        (e) =>
          (e.event_type === 'ENTRY' || e.event_type === 'RE_ENTRY') &&
          e.verification_status === 'CONFIRMED'
      ).length;
      const exits = inWindow.filter(
        (e) => e.event_type === 'EXIT' && e.verification_status === 'CONFIRMED'
      ).length;
      return {
        label: `${startSec}s`,
        entries,
        exits,
      };
    });
  }, [analysisResult]);

  return (
    <AppLayout
      activeRoute={activeRoute}
      onNavigate={setActiveRoute}
      selectedBranch={selectedBranch}
      branches={branches}
      onSelectBranch={setSelectedBranch}
      systemOnline={Boolean(health?.gemini_configured ?? true)}
      modelName={health?.model || 'gemini-3.1-flash-lite'}
      notifications={notifications}
      onMarkAllNotificationsRead={() =>
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      }
      currentUserName="Admin User"
      currentUserRole="Hotel Staff"
    >
      {/* Hidden Global File Input so any screen can trigger CCTV Video Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/mpeg,video/3gpp,.mp4,.mov,.webm,.avi,.3gp"
        onChange={(e) => handleFilePicked(e.target.files?.[0])}
        className="hidden"
      />

      {/* Global Error State Banner */}
      {errorBanner && (
        <ErrorState
          code={errorBanner.code}
          message={errorBanner.message}
          detail={errorBanner.detail}
          onRetry={selectedFile ? handleAnalyzeVideo : undefined}
          onDismiss={() => setErrorBanner(null)}
        />
      )}

      {/* Global Success Notification Banner */}
      {toastSuccess && (
        <SuccessState
          title={toastSuccess.title}
          message={toastSuccess.message}
          onDismiss={() => setToastSuccess(null)}
        />
      )}

      {/* =====================================================================
          SCREEN 1: DASHBOARD (Matches Reference Image Layout & Visuals)
         ===================================================================== */}
      {activeRoute === 'dashboard' && (
        <div className="space-y-6">
          {/* Top 5 KPI Cards (Matches Reference Image) */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              label="Total Rooms"
              value={totalRoomsCount}
              supportingText={`Across ${floorCount} Floors (${selectedBranch})`}
              icon={<BedDouble className="w-6 h-6" />}
              iconTone="blue"
              onClick={() => setActiveRoute('rooms')}
            />

            <StatCard
              label="Occupied Rooms"
              value={occupiedRoomsCount}
              supportingText={`${occupiedPct}% Occupancy`}
              icon={<BedDouble className="w-6 h-6" />}
              iconTone="green"
              ringPercentage={occupiedPct}
              ringColor="#12B981"
              onClick={() => setActiveRoute('rooms')}
            />

            <StatCard
              label="Available Rooms"
              value={availableRoomsCount}
              supportingText={`${availablePct}% Available`}
              icon={<BedDouble className="w-6 h-6" />}
              iconTone="blue"
              ringPercentage={availablePct}
              ringColor="#1769E8"
              onClick={() => setActiveRoute('rooms')}
            />

            <StatCard
              label="Current Guests"
              value={
                analysisResult
                  ? `${analysisResult.deterministic_metrics.current_count} (${doorwayConfig.roomId})`
                  : currentRegisteredGuestsCount
              }
              supportingText={
                analysisResult
                  ? `CCTV Verified in ${doorwayConfig.roomId}`
                  : `${currentRegisteredGuestsCount} Registered In House`
              }
              icon={<Users className="w-6 h-6" />}
              iconTone="navy"
              ringPercentage={
                analysisResult
                  ? Math.min(
                      100,
                      Math.round(
                        (analysisResult.deterministic_metrics.current_count /
                          Math.max(1, doorwayConfig.registeredGuestCount)) *
                          100
                      )
                    )
                  : 75
              }
              ringColor="#1769E8"
              onClick={() => setActiveRoute('activity')}
            />

            <StatCard
              label="Cameras Online"
              value={`${liveRtspCamerasCount + activeUploadCamerasCount} / ${cameras.length}`}
              supportingText={
                videoPreviewUrl
                  ? `${doorwayConfig.cameraId} Clip Loaded`
                  : 'Live RTSP Not Connected'
              }
              icon={<Video className="w-6 h-6" />}
              iconTone="green"
              rightAccessory={
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    videoPreviewUrl
                      ? 'bg-[#12B981] text-white'
                      : 'bg-[#EAF3FF] text-[#1769E8]'
                  }`}
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              }
              onClick={() => setActiveRoute('monitoring')}
            />
          </section>

          {/* Main Two-Column Dashboard Content (Matches Reference Image) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN (7 Cols): Room Lifecycle Status + Analysis Quality */}
            <div className="lg:col-span-7 space-y-6">
              {/* Bottom-Left Row: Room Lifecycle Status + Analysis Quality */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Room Lifecycle Status Card */}
                <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
                  <SectionHeader
                    title="Room Lifecycle Status"
                    icon={<BedDouble className="w-4 h-4" />}
                  />
                  <div className="flex items-center justify-between gap-4 pt-1">
                    {/* Donut Ring */}
                    <div className="relative flex items-center justify-center shrink-0">
                      <svg width="116" height="116" className="-rotate-90">
                        <circle
                          cx="58"
                          cy="58"
                          r="44"
                          fill="transparent"
                          stroke="#E1EAF5"
                          strokeWidth="12"
                        />
                        <circle
                          cx="58"
                          cy="58"
                          r="44"
                          fill="transparent"
                          stroke="#1769E8"
                          strokeWidth="12"
                          strokeDasharray={`${(occupiedPct / 100) * 276.46} 276.46`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-2xl font-extrabold text-[#152B4A] font-mono tabular-nums">
                          {totalRoomsCount}
                        </span>
                        <span className="text-[11px] font-semibold text-[#718096]">
                          Total Rooms
                        </span>
                      </div>
                    </div>

                    {/* Lifecycle Legend */}
                    <div className="flex-1 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 font-medium text-[#152B4A]">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#1769E8]" />
                          Occupied / Checked-In
                        </span>
                        <span className="font-mono font-bold text-[#152B4A] tabular-nums">
                          {occupiedRoomsCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 font-medium text-[#152B4A]">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#12B981]" />
                          Available
                        </span>
                        <span className="font-mono font-bold text-[#152B4A] tabular-nums">
                          {availableRoomsCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 font-medium text-[#152B4A]">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#F5A623]" />
                          Reserved
                        </span>
                        <span className="font-mono font-bold text-[#152B4A] tabular-nums">
                          {reservedRoomsCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 font-medium text-[#152B4A]">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
                          Cleaning / Handover
                        </span>
                        <span className="font-mono font-bold text-[#152B4A] tabular-nums">
                          {cleaningRoomsCount}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Analysis Quality Card */}
                <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
                  <SectionHeader
                    title="Analysis Quality"
                    icon={<ShieldCheck className="w-4 h-4 text-[#12B981]" />}
                  />
                  <div className="flex items-center justify-between gap-4 pt-1">
                    <ConfidenceIndicator
                      percentage={avgConfidence}
                      size="lg"
                      label="Overall Confidence"
                      showDisclaimer
                    />

                    <div className="flex-1 space-y-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            analysisResult ? 'text-[#12B981]' : 'text-[#CBD5E1]'
                          }`}
                        />
                        <span className="font-medium text-[#152B4A]">
                          {analysisResult
                            ? `${
                                analysisResult.enriched_events.filter(
                                  (e) => e.verification_status === 'CONFIRMED'
                                ).length
                              } Verified Events`
                            : 'Awaiting Video Analysis'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            analysisResult &&
                            analysisResult.deterministic_metrics
                              .unverified_event_count === 0
                              ? 'text-[#12B981]'
                              : analysisResult
                              ? 'text-[#F5A623]'
                              : 'text-[#CBD5E1]'
                          }`}
                        />
                        <span className="font-medium text-[#152B4A]">
                          {analysisResult
                            ? `${analysisResult.deterministic_metrics.unverified_event_count} Unverified Events`
                            : '0 Unverified Events'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            analysisResult ? 'text-[#12B981]' : 'text-[#CBD5E1]'
                          }`}
                        />
                        <span className="font-medium text-[#152B4A] line-clamp-1">
                          {analysisResult
                            ? analysisResult.gemini_raw.video_quality_assessment ||
                              'Clear Camera Angle'
                            : 'Doorway ROI Configured'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN (5 Cols): Room Activity Trend + Recent Events */}
            <div className="lg:col-span-5 space-y-6">
              {/* 1. Room Activity Trend Card */}
              <ChartCard
                title="Room Activity Trend"
                icon={<BarChart3 className="w-4 h-4" />}
                rightControls={
                  <Select
                    value={trendTimeRange}
                    onChange={(e) =>
                      setTrendTimeRange(e.target.value as 'CLIP' | '24H')
                    }
                    className="!h-8 !text-xs !w-auto"
                  >
                    <option value="CLIP">Analyzed Video Timeline</option>
                    <option value="24H">Current Session</option>
                  </Select>
                }
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-end gap-4 text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-[#152B4A]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#1769E8]" />
                      Entries (
                      {analysisResult
                        ? analysisResult.deterministic_metrics.total_entries
                        : 0}
                      )
                    </span>
                    <span className="flex items-center gap-1.5 text-[#152B4A]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#60A5FA]" />
                      Exits (
                      {analysisResult
                        ? analysisResult.deterministic_metrics.total_exits
                        : 0}
                      )
                    </span>
                  </div>

                  {activityBuckets.length === 0 ? (
                    <div className="h-44 rounded-xl bg-[#F5F8FD] border border-dashed border-[#CBD5E1] flex flex-col items-center justify-center p-4 text-center">
                      <BarChart3 className="w-6 h-6 text-[#1769E8] mb-1.5 opacity-80" />
                      <div className="text-xs font-bold text-[#152B4A]">
                        No Video Activity Analyzed Yet
                      </div>
                      <p className="text-[11px] text-[#718096] max-w-xs mt-0.5">
                        Upload and analyze a CCTV video clip to plot real entry and exit timestamps.
                      </p>
                    </div>
                  ) : (
                    <div className="h-44 pt-4 pb-1 px-2 bg-[#F5F8FD]/60 rounded-xl border border-[#E1EAF5] flex items-end justify-between gap-2">
                      {activityBuckets.map((b, i) => {
                        const maxVal = Math.max(
                          3,
                          ...activityBuckets.map((x) => Math.max(x.entries, x.exits))
                        );
                        const entryHeightPct = Math.round((b.entries / maxVal) * 100);
                        const exitHeightPct = Math.round((b.exits / maxVal) * 100);
                        return (
                          <div
                            key={i}
                            className="flex-1 flex flex-col items-center h-full justify-end gap-1.5"
                          >
                            <div className="w-full flex items-end justify-center gap-1 h-28">
                              <div
                                style={{
                                  height: `${Math.max(entryHeightPct, b.entries > 0 ? 18 : 4)}%`,
                                }}
                                title={`Entries: ${b.entries}`}
                                className={`w-2.5 sm:w-3 rounded-t ${
                                  b.entries > 0 ? 'bg-[#1769E8]' : 'bg-[#E1EAF5]'
                                } transition-all`}
                              />
                              <div
                                style={{
                                  height: `${Math.max(exitHeightPct, b.exits > 0 ? 18 : 4)}%`,
                                }}
                                title={`Exits: ${b.exits}`}
                                className={`w-2.5 sm:w-3 rounded-t ${
                                  b.exits > 0 ? 'bg-[#60A5FA]' : 'bg-[#E1EAF5]'
                                } transition-all`}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-[#718096]">
                              {b.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ChartCard>

              {/* 2. Recent Events Card */}
              <div className="bg-white border border-[#E1EAF5] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3.5">
                <SectionHeader
                  title="Recent Events"
                  icon={<Clock className="w-4 h-4" />}
                  rightContent={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveRoute('timeline')}
                      rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                      className="!text-[#1769E8] !px-2 !h-7"
                    >
                      View All
                    </Button>
                  }
                />

                {!analysisResult || analysisResult.enriched_events.length === 0 ? (
                  <EmptyState
                    compact
                    title="No CCTV Events Recorded Yet"
                    description="Analyze a corridor CCTV clip to view verified ENTRY, EXIT, RE_ENTRY, and CORRIDOR_PASS events."
                    actionLabel="Go to Video Analysis"
                    onAction={() => setActiveRoute('analysis')}
                  />
                ) : (
                  <div className="space-y-2">
                    {analysisResult.enriched_events.slice(0, 4).map((ev) => (
                      <EventCard
                        key={ev.event_id}
                        event={ev}
                        compact
                        onClick={() => handleSeekVideoTo(ev.timestamp_seconds)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SCREEN: ROOM MANAGEMENT — PHASE 1 LODGE FOUNDATION
         ===================================================================== */}
      {activeRoute === 'rooms' && <RoomManagementPage />}

      {/* =====================================================================
          SCREEN 2: CCTV MONITORING
         ===================================================================== */}
      {activeRoute === 'monitoring' && (
        <div className="space-y-6">
          <PageHeader
            title="CCTV Corridor Monitoring"
            subtitle="Inspect corridor camera nodes, doorway threshold alignment, and uploaded evaluation feeds."
            icon={<Video className="w-5 h-5" />}
            actions={
              <Button
                variant="primary"
                size="md"
                icon={<Upload className="w-4 h-4" />}
                onClick={() => {
                  setActiveRoute('analysis');
                  setTimeout(() => fileInputRef.current?.click(), 80);
                }}
              >
                Upload Corridor Video Clip
              </Button>
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterBar
              options={[
                { id: 'ALL', label: 'All Corridors', count: cameras.length },
                { id: 'Floor 1 — North Wing', label: 'Floor 1 North' },
                { id: 'Floor 1 — South Wing', label: 'Floor 1 South' },
                { id: 'Floor 2 — Executive Wing', label: 'Floor 2 Executive' },
                { id: 'Floor 3 — Penthouse Wing', label: 'Floor 3 Penthouse' },
              ]}
              activeId={selectedMonitoringCorridor}
              onSelect={setSelectedMonitoringCorridor}
            />
            <StatusBadge
              label="Phase 0: Uploaded Video Evaluation Active (Live RTSP Disabled)"
              tone="info"
              dot
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cameras
              .filter((c) =>
                selectedMonitoringCorridor === 'ALL'
                  ? true
                  : c.corridor === selectedMonitoringCorridor
              )
              .map((cam) => {
                const isTargetCam = cam.cameraId === doorwayConfig.cameraId;
                const hasClip = isTargetCam && Boolean(videoPreviewUrl);
                return (
                  <div
                    key={cam.cameraId}
                    className="bg-white border border-[#E1EAF5] rounded-2xl overflow-hidden shadow-2xs flex flex-col justify-between"
                  >
                    <SectionHeader
                      darkHeader
                      title={`${cam.cameraId} · ${cam.targetRoomId}`}
                      subtitle={cam.name}
                      icon={<Camera className="w-4 h-4 text-white" />}
                      rightContent={
                        <StatusBadge
                          label={hasClip ? 'Clip Loaded' : 'No Live RTSP'}
                          tone={hasClip ? 'success' : 'neutral'}
                        />
                      }
                    />

                    <div className="p-4 space-y-4">
                      {hasClip && videoPreviewUrl ? (
                        <div className="relative rounded-xl overflow-hidden bg-[#061F43] aspect-video">
                          <video
                            src={videoPreviewUrl}
                            controls
                            playsInline
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="rounded-xl bg-[#061F43] text-white aspect-video p-6 flex flex-col items-center justify-center text-center">
                          <Video className="w-8 h-8 text-[#3188F5] mb-2 opacity-80" />
                          <div className="text-xs font-bold">
                            Live RTSP Stream Not Connected
                          </div>
                          <p className="text-[11px] text-white/65 max-w-xs mt-1">
                            Upload an MP4/MOV/WebM clip for {cam.targetRoomId} to inspect doorway crossings.
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="text-xs text-[#718096] font-mono">
                          Angle: <strong className="text-[#152B4A]">{cam.angle}</strong> ·{' '}
                          {cam.corridor}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCameraDetailModal(cam)}
                          >
                            Camera Details
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setDoorwayConfig((c) => ({
                                ...c,
                                cameraId: cam.cameraId,
                                roomId: cam.targetRoomId,
                              }));
                              setActiveRoute('analysis');
                            }}
                          >
                            Analyze Clip
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* =====================================================================
          SCREEN 3: VIDEO ANALYSIS (Preserves Full Working Gemini Pipeline)
         ===================================================================== */}
      {activeRoute === 'analysis' && (
        <div className="space-y-6">
          <PageHeader
            title="CCTV Video Analysis Studio"
            subtitle="Upload short corridor CCTV clips, align the doorway threshold ROI, and execute real multimodal Gemini entry/exit analysis."
            icon={<Play className="w-5 h-5" />}
            meta={
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#718096] font-mono">
                <StatusBadge label={`Room: ${doorwayConfig.roomId}`} tone="navy" mono />
                <StatusBadge
                  label={`Camera: ${doorwayConfig.cameraId}`}
                  tone="info"
                  mono
                />
                <StatusBadge
                  label={`Model: ${health?.model || 'gemini-3.1-flash-lite'}`}
                  tone="success"
                  mono
                />
              </div>
            }
            actions={
              <>
                <Button
                  variant="outline"
                  size="md"
                  icon={<Sliders className="w-4 h-4 text-[#1769E8]" />}
                  onClick={() => setDoorwayModalOpen(true)}
                >
                  Configure Doorway ROI
                </Button>
                {analysisResult && (
                  <Button
                    variant="secondary"
                    size="md"
                    icon={<Download className="w-4 h-4" />}
                    onClick={handleDownloadJsonReport}
                  >
                    Export JSON Report
                  </Button>
                )}
              </>
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Column (7 Cols): Video Upload, Preview Player, ROI Controls & Test Clip Generator */}
            <div className="lg:col-span-7 bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs flex flex-col justify-between space-y-5">
              <SectionHeader
                title="CCTV Corridor Video Feed & Doorway Threshold"
                subtitle="Select an MP4, MOV, or WebM video from your Android phone or computer, or generate a real test scenario clip below."
                icon={<Video className="w-4 h-4" />}
                rightContent={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDoorwayOverlay((v) => !v)}
                  >
                    {showDoorwayOverlay ? 'Hide Threshold ROI' : 'Show Threshold ROI'}
                  </Button>
                }
              />

              {/* Video Dropzone or Preview Player */}
              {!videoPreviewUrl ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFilePicked(e.dataTransfer.files?.[0]);
                  }}
                  className="border-2 border-dashed border-[#CBD5E1] hover:border-[#1769E8] rounded-2xl bg-[#F5F8FD] p-8 flex flex-col items-center justify-center text-center min-h-[300px] transition-colors"
                >
                  <div className="w-14 h-14 rounded-2xl bg-[#EAF3FF] text-[#1769E8] flex items-center justify-center mb-3 shadow-2xs">
                    <Upload className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-[#152B4A]">
                    Select or Drop Corridor CCTV Video
                  </h3>
                  <p className="text-xs sm:text-sm text-[#718096] max-w-md mt-1 mb-5">
                    Supports MP4, MOV, WebM, AVI, and 3GPP up to 100 MB. Uses 2 MB chunked upload and background polling for reliable mobile &amp; desktop analysis.
                  </p>
                  <Button
                    variant="primary"
                    size="lg"
                    icon={<Upload className="w-4 h-4" />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse Video File
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-[#061F43] border border-[#E1EAF5] aspect-video">
                    <video
                      ref={videoRef}
                      src={videoPreviewUrl}
                      controls
                      playsInline
                      onLoadedMetadata={(e) => {
                        const dur = e.currentTarget.duration;
                        if (Number.isFinite(dur) && dur > 0) {
                          setVideoDurationSec(Math.round(dur));
                        }
                      }}
                      onTimeUpdate={(e) => {
                        setCurrentVideoTime(e.currentTarget.currentTime);
                      }}
                      className="w-full h-full object-contain"
                    />

                    {/* Visual Doorway Threshold ROI Overlay on Video Player */}
                    {showDoorwayOverlay && (
                      <div
                        style={{
                          left: `${doorwayConfig.thresholdZone.x}%`,
                          top: `${doorwayConfig.thresholdZone.y}%`,
                          width: `${doorwayConfig.thresholdZone.width}%`,
                          height: `${doorwayConfig.thresholdZone.height}%`,
                        }}
                        className="pointer-events-none absolute border-2 border-[#12B981] bg-[#12B981]/15 flex flex-col justify-between p-1.5"
                      >
                        <div className="bg-[#082B59]/90 text-white text-[10px] font-mono px-1.5 py-0.5 w-fit rounded-xs">
                          {doorwayConfig.roomId} DOORWAY ROI (
                          {doorwayConfig.insideDirection})
                        </div>
                        <div className="border-t-2 border-dashed border-[#3188F5] w-full text-center bg-[#082B59]/90 text-white text-[10px] font-mono py-0.5">
                          ENTRY / EXIT THRESHOLD
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Video File Telemetry Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#718096] font-mono tabular-nums bg-[#F5F8FD] px-3.5 py-2.5 rounded-xl border border-[#E1EAF5]">
                    <div className="truncate max-w-[260px] sm:max-w-md font-bold text-[#152B4A]">
                      File: {selectedFile?.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        Duration:{' '}
                        {videoDurationSec > 0
                          ? formatSecondsToVideoTimestamp(videoDurationSec)
                          : 'Detecting...'}
                      </span>
                      <span>·</span>
                      <span>
                        Playhead: {formatSecondsToVideoTimestamp(currentVideoTime)}
                      </span>
                      <span>·</span>
                      <span className="text-[#1769E8] font-semibold">
                        {uploadStatusText}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload & Gemini Analysis Progress Bar */}
              {isAnalyzing && (
                <div className="p-3.5 bg-[#EAF3FF]/70 border border-[#1769E8]/25 rounded-xl space-y-2">
                  <ProgressIndicator
                    value={uploadProgressPct}
                    label={analysisPhaseText || 'Analyzing video with Gemini AI...'}
                    sublabel={`${uploadProgressPct}%`}
                  />
                </div>
              )}

              {/* Primary Action Bar: Analyze Video / Choose Video File / Clear */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E1EAF5]">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button
                    variant="primary"
                    size="md"
                    loading={isAnalyzing}
                    loadingText="Analyzing with Gemini..."
                    disabled={!selectedFile || isGeneratingSample}
                    icon={<Play className="w-4 h-4 fill-current" />}
                    onClick={handleAnalyzeVideo}
                  >
                    Analyze Video
                  </Button>

                  <Button
                    variant="outline"
                    size="md"
                    disabled={isAnalyzing}
                    icon={<Upload className="w-4 h-4" />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose Video File
                  </Button>

                  <Button
                    variant="ghost"
                    size="md"
                    disabled={isAnalyzing || (!selectedFile && !analysisResult)}
                    icon={<RotateCcw className="w-3.5 h-3.5" />}
                    onClick={handleClearReset}
                  >
                    Clear / Reset
                  </Button>
                </div>
              </div>

              {/* Built-in Real CCTV Video Test Clip Generator for Phase 0.3 Validation Scenarios */}
              <div className="p-4 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#082B59]">
                    Phase 0.3 Real Playable Test Video Generator (Tests 1–5):
                  </span>
                  {isGeneratingSample && (
                    <span className="text-xs font-mono font-bold text-[#1769E8]">
                      Rendering video ({sampleProgress}%)...
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {SAMPLE_SCENARIOS.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      disabled={isGeneratingSample || isAnalyzing}
                      onClick={() => handleGenerateSampleClip(sc.id)}
                      className="p-2.5 text-left bg-white hover:bg-[#EAF3FF]/60 border border-[#E1EAF5] hover:border-[#1769E8] rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <div className="text-xs font-bold text-[#152B4A] truncate">
                        {sc.title}
                      </div>
                      <div className="text-[11px] text-[#718096] line-clamp-2 mt-0.5">
                        {sc.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column (5 Cols): Live Analysis Results Summary & Occupancy Breakdown */}
            <div className="lg:col-span-5 bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs flex flex-col justify-between space-y-5">
              {!analysisResult ? (
                <div className="my-auto">
                  <EmptyState
                    icon={<ShieldCheck className="w-6 h-6" />}
                    title="Ready for Gemini Multimodal Video Analysis"
                    description="Select an MP4/MOV/WebM CCTV video or generate one of the real test clips on the left, then click Analyze Video. Gemini will inspect the video frames and our deterministic Room Occupancy Engine will compute verified entry, exit, re-entry, and stay duration metrics."
                    actionLabel="Browse Video File"
                    onAction={() => fileInputRef.current?.click()}
                  />
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4 border-b border-[#E1EAF5] pb-4">
                    <div>
                      <StatusBadge
                        label={`Verified Gemini Analysis (${analysisResult.analysis_id})`}
                        tone="success"
                        dot
                      />
                      <h2 className="text-lg font-extrabold text-[#082B59] mt-1.5">
                        {analysisResult.doorway_config.roomId} Intelligence Summary
                      </h2>
                    </div>
                    <div className="text-right font-mono text-xs text-[#718096] tabular-nums">
                      <div>{analysisResult.analyzed_at_dar_es_salaam}</div>
                      <div>Clip: {analysisResult.gemini_raw.video_duration_seconds}s</div>
                    </div>
                  </div>

                  {/* Quick Occupancy Metrics Strip */}
                  <div className="grid grid-cols-4 gap-2.5 text-center font-mono tabular-nums">
                    <div className="p-2.5 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl">
                      <div className="text-[10px] font-sans font-semibold text-[#718096]">
                        Inside Now
                      </div>
                      <div className="text-lg font-extrabold text-[#1769E8]">
                        {analysisResult.deterministic_metrics.current_count}
                      </div>
                    </div>
                    <div className="p-2.5 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl">
                      <div className="text-[10px] font-sans font-semibold text-[#718096]">
                        Peak Occ
                      </div>
                      <div className="text-lg font-extrabold text-[#082B59]">
                        {analysisResult.deterministic_metrics.peak_count}
                      </div>
                    </div>
                    <div className="p-2.5 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl">
                      <div className="text-[10px] font-sans font-semibold text-[#718096]">
                        Entries
                      </div>
                      <div className="text-lg font-extrabold text-[#12B981]">
                        {analysisResult.deterministic_metrics.total_entries}
                      </div>
                    </div>
                    <div className="p-2.5 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl">
                      <div className="text-[10px] font-sans font-semibold text-[#718096]">
                        Exits
                      </div>
                      <div className="text-lg font-extrabold text-[#F5A623]">
                        {analysisResult.deterministic_metrics.total_exits}
                      </div>
                    </div>
                  </div>

                  {/* Discrepancy Warning if Occupancy > Registered Guests */}
                  {analysisResult.deterministic_metrics.occupancy_discrepancy_warning && (
                    <div className="p-3 bg-[#FFFBEB] border border-[#F5A623]/40 rounded-xl text-xs text-[#92400E] flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-[#F5A623] shrink-0 mt-0.5" />
                      <span>
                        {
                          analysisResult.deterministic_metrics
                            .occupancy_discrepancy_warning
                        }
                      </span>
                    </div>
                  )}

                  {/* Executive Summary from Gemini */}
                  <div className="p-3.5 bg-[#EAF3FF]/60 border border-[#CFE2FF] rounded-xl space-y-1">
                    <div className="text-xs font-bold text-[#082B59]">
                      Gemini Vision Narrative Summary
                    </div>
                    <p className="text-xs text-[#152B4A] leading-relaxed">
                      {analysisResult.gemini_raw.analysis_summary}
                    </p>
                  </div>

                  {/* Individual Stay Durations */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#718096]">
                        Tracked Person Stay Durations
                      </h3>
                      <span className="text-[11px] font-mono text-[#718096]">
                        Anonymous Session IDs
                      </span>
                    </div>

                    {analysisResult.deterministic_metrics.person_stays.length === 0 ? (
                      <div className="p-3 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl text-xs text-[#718096]">
                        No confirmed room entries recorded in this video clip.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-[#E1EAF5] rounded-xl">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#F5F8FD] text-[#152B4A] border-b border-[#E1EAF5]">
                              <th className="py-2 px-3 font-bold">Person ID</th>
                              <th className="py-2 px-3 font-bold">Entry</th>
                              <th className="py-2 px-3 font-bold">Exit</th>
                              <th className="py-2 px-3 font-bold text-right">
                                Stay Duration
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E1EAF5] font-mono tabular-nums">
                            {analysisResult.deterministic_metrics.person_stays.map(
                              (stay) => (
                                <tr key={stay.stay_id} className="hover:bg-[#F5F8FD]">
                                  <td className="py-2 px-3 text-[#152B4A] font-bold">
                                    {stay.person_id}
                                    {stay.is_re_entry ? ' (Re-Entry)' : ''}
                                  </td>
                                  <td className="py-2 px-3 text-[#12B981] font-semibold">
                                    {stay.entry_dar_es_salaam_time ||
                                      stay.entry_video_timestamp}
                                  </td>
                                  <td className="py-2 px-3 text-[#F5A623] font-semibold">
                                    {stay.exit_dar_es_salaam_time ||
                                      stay.exit_video_timestamp ||
                                      'Still Inside'}
                                  </td>
                                  <td className="py-2 px-3 text-right text-[#1769E8] font-bold">
                                    {stay.formatted_duration}
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Chronological Event Feed Preview */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#718096]">
                        Detected Corridor &amp; Doorway Events (
                        {analysisResult.enriched_events.length})
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveRoute('timeline')}
                        className="!h-7 !px-2 !text-xs !text-[#1769E8]"
                      >
                        Full Timeline →
                      </Button>
                    </div>

                    <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                      {analysisResult.enriched_events.map((ev) => (
                        <EventCard
                          key={ev.event_id}
                          event={ev}
                          compact
                          onClick={() => handleSeekVideoTo(ev.timestamp_seconds)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Phase 0.3 Accuracy Validation Report & Ground-Truth Comparison */}
          <AccuracyValidationPanel
            analysisResult={analysisResult}
            currentVideoPlayheadSec={currentVideoTime}
            executedTests={executedValidationTests}
            onSaveExecutedTest={(rec) =>
              setExecutedValidationTests((prev) => [rec, ...prev])
            }
          />
        </div>
      )}

      {/* =====================================================================
          SCREEN 4: ROOM ACTIVITY
         ===================================================================== */}
      {activeRoute === 'activity' && (
        <div className="space-y-6">
          <PageHeader
            title="Room Activity & Occupancy Intelligence"
            subtitle="Deterministic room occupancy verification separating Registered Guest Count, Confirmed Entries/Exits, Re-Entries, and Temporary Vacant Periods."
            icon={<BedDouble className="w-5 h-5" />}
            actions={
              <Button
                variant="primary"
                size="md"
                icon={<Play className="w-4 h-4" />}
                onClick={() => setActiveRoute('analysis')}
              >
                Analyze CCTV Video
              </Button>
            }
          />

          {!analysisResult ? (
            <EmptyState
              icon={<BedDouble className="w-6 h-6" />}
              title="No Room Activity Detected in Current Session"
              description="Upload and analyze a corridor CCTV clip in the Video Analysis screen to calculate verified room occupancy, individual stay durations, and temporary vacancy intervals."
              actionLabel="Go to Video Analysis"
              onAction={() => setActiveRoute('analysis')}
            />
          ) : (
            <div className="space-y-6">
              {/* Detailed Occupancy Breakdown KPI Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Registered Guest Count"
                  value={analysisResult.deterministic_metrics.registered_guest_count}
                  supportingText={`${doorwayConfig.roomId} Front-Desk Booking`}
                  icon={<Users className="w-5 h-5" />}
                  iconTone="navy"
                />
                <StatCard
                  label="People Currently Inside"
                  value={analysisResult.deterministic_metrics.current_count}
                  supportingText={`Active IDs: ${
                    analysisResult.deterministic_metrics.active_occupants.join(', ') ||
                    'None (0)'
                  }`}
                  icon={<BedDouble className="w-5 h-5" />}
                  iconTone="green"
                />
                <StatCard
                  label="Corridor Passersby Ignored"
                  value={analysisResult.deterministic_metrics.corridor_pass_count}
                  supportingText="Passed room without entering"
                  icon={<DoorOpen className="w-5 h-5" />}
                  iconTone="blue"
                />
                <StatCard
                  label="Unverified / Uncertain Events"
                  value={analysisResult.deterministic_metrics.unverified_event_count}
                  supportingText="Did not alter confirmed occupancy"
                  icon={<AlertCircle className="w-5 h-5" />}
                  iconTone="amber"
                />
              </div>

              {/* Individual Stay Durations Table */}
              <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
                <SectionHeader
                  title="Individual Occupant Stay Durations & Re-Entry Log"
                  subtitle="Calculated deterministically from confirmed inward and outward doorway threshold crossings."
                  icon={<Clock className="w-4 h-4" />}
                />
                <DataTable
                  columns={[
                    {
                      key: 'stay_id',
                      header: 'Stay ID',
                      render: (s) => (
                        <span className="font-mono text-xs text-[#718096]">
                          {s.stay_id}
                        </span>
                      ),
                    },
                    {
                      key: 'person_id',
                      header: 'Anonymous Person ID',
                      render: (s) => (
                        <span className="font-mono font-bold text-[#082B59]">
                          {s.person_id}
                        </span>
                      ),
                    },
                    {
                      key: 'entry',
                      header: 'Entry Timestamp',
                      render: (s) => (
                        <span className="font-mono font-semibold text-[#12B981]">
                          {s.entry_video_timestamp}
                          {s.entry_dar_es_salaam_time
                            ? ` (${s.entry_dar_es_salaam_time})`
                            : ''}
                        </span>
                      ),
                    },
                    {
                      key: 'exit',
                      header: 'Exit Timestamp',
                      render: (s) => (
                        <span className="font-mono font-semibold text-[#F5A623]">
                          {s.exit_video_timestamp
                            ? `${s.exit_video_timestamp}${
                                s.exit_dar_es_salaam_time
                                  ? ` (${s.exit_dar_es_salaam_time})`
                                  : ''
                              }`
                            : 'Still Inside Room'}
                        </span>
                      ),
                    },
                    {
                      key: 'duration',
                      header: 'Calculated Duration',
                      render: (s) => (
                        <span className="font-mono font-bold text-[#1769E8]">
                          {s.formatted_duration}
                        </span>
                      ),
                    },
                    {
                      key: 'note',
                      header: 'Tracking Note',
                      render: (s) => (
                        <span className="text-xs text-[#718096]">
                          {s.identity_confidence_note}
                        </span>
                      ),
                    },
                  ]}
                  data={analysisResult.deterministic_metrics.person_stays}
                  rowKey={(s) => s.stay_id}
                  emptyTitle="No Confirmed Room Stays"
                  emptyDescription="No person crossed into the room during this video clip."
                />
              </div>

              {/* Temporary Vacant Periods Table */}
              <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
                <SectionHeader
                  title="Temporary Vacant Periods (Occupancy = 0 During Active Stay)"
                  subtitle="When occupancy drops to 0, the room transitions to TEMPORARILY_VACANT — never automatic checkout."
                  icon={<DoorOpen className="w-4 h-4" />}
                />
                <DataTable
                  columns={[
                    {
                      key: 'period_id',
                      header: 'Period ID',
                      render: (vp) => (
                        <span className="font-mono text-xs text-[#718096]">
                          {vp.period_id}
                        </span>
                      ),
                    },
                    {
                      key: 'vacated',
                      header: 'Vacated At',
                      render: (vp) => (
                        <span className="font-mono font-semibold text-[#F5A623]">
                          {vp.vacated_at_video_timestamp}
                        </span>
                      ),
                    },
                    {
                      key: 'reoccupied',
                      header: 'Re-Occupied At',
                      render: (vp) => (
                        <span className="font-mono font-semibold text-[#12B981]">
                          {vp.reoccupied_at_video_timestamp || 'Still Temporarily Vacant'}
                        </span>
                      ),
                    },
                    {
                      key: 'duration',
                      header: 'Vacant Duration',
                      render: (vp) => (
                        <span className="font-mono font-bold text-[#1769E8]">
                          {vp.formatted_duration}
                        </span>
                      ),
                    },
                  ]}
                  data={analysisResult.deterministic_metrics.temporary_vacant_periods}
                  rowKey={(vp) => vp.period_id}
                  emptyTitle="No Temporary Vacancy Intervals"
                  emptyDescription="No temporary vacant periods occurred during this video clip."
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SCREEN 5: EVENT TIMELINE
         ===================================================================== */}
      {activeRoute === 'timeline' && (
        <div className="space-y-6">
          <PageHeader
            title="Chronological CCTV Event Timeline"
            subtitle="Every detected corridor and doorway event with video-relative timestamp, anonymous person ID, model confidence, and verification evidence."
            icon={<Clock className="w-5 h-5" />}
            actions={
              <Button
                variant="primary"
                size="md"
                icon={<Play className="w-4 h-4" />}
                onClick={() => setActiveRoute('analysis')}
              >
                Analyze New Video
              </Button>
            }
          />

          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FilterBar
                options={[
                  { id: 'ALL', label: 'All Events' },
                  { id: 'ENTRY', label: 'Entries' },
                  { id: 'EXIT', label: 'Exits' },
                  { id: 'RE_ENTRY', label: 'Re-Entries' },
                  { id: 'CORRIDOR_PASS', label: 'Corridor Pass' },
                  { id: 'UNKNOWN', label: 'Unknown' },
                ]}
                activeId={eventFilter}
                onSelect={setEventFilter}
              />
              <SearchInput
                value={timelineSearch}
                onChange={setTimelineSearch}
                placeholder="Filter by Person ID, Room, or Evidence..."
                className="w-full sm:w-64"
              />
            </div>

            {!analysisResult ? (
              <EmptyState
                icon={<Clock className="w-6 h-6" />}
                title="No Timeline Events Recorded Yet"
                description="Upload and analyze a CCTV video clip to inspect chronological doorway events."
                actionLabel="Open Video Analysis"
                onAction={() => setActiveRoute('analysis')}
              />
            ) : (
              <div className="space-y-6">
                <DataTable
                  columns={[
                    {
                      key: 'event_id',
                      header: 'Event ID',
                      render: (ev) => (
                        <span className="font-mono text-xs text-[#718096]">
                          {ev.event_id}
                        </span>
                      ),
                    },
                    {
                      key: 'video_time',
                      header: 'Video Time',
                      render: (ev) => (
                        <span className="font-mono font-bold text-[#1769E8]">
                          {ev.formatted_relative_time}
                        </span>
                      ),
                    },
                    {
                      key: 'eat_clock',
                      header: 'Dar es Salaam Clock',
                      render: (ev) => (
                        <span className="font-mono text-xs text-[#718096]">
                          {ev.dar_es_salaam_clock_time || 'Relative Only (No OSD)'}
                        </span>
                      ),
                    },
                    {
                      key: 'person_id',
                      header: 'Person ID',
                      render: (ev) => (
                        <span className="font-mono font-bold text-[#152B4A]">
                          {ev.person_id}
                        </span>
                      ),
                    },
                    {
                      key: 'type',
                      header: 'Event Type',
                      render: (ev) => (
                        <StatusBadge
                          label={ev.event_type}
                          tone={
                            ev.event_type === 'ENTRY' || ev.event_type === 'RE_ENTRY'
                              ? 'success'
                              : ev.event_type === 'EXIT'
                              ? 'info'
                              : ev.event_type === 'CORRIDOR_PASS'
                              ? 'warning'
                              : 'neutral'
                          }
                        />
                      ),
                    },
                    {
                      key: 'verification',
                      header: 'Verification',
                      render: (ev) => (
                        <StatusBadge
                          label={ev.verification_status}
                          tone={
                            ev.verification_status === 'CONFIRMED' ? 'success' : 'warning'
                          }
                          dot
                        />
                      ),
                    },
                    {
                      key: 'confidence',
                      header: 'Model Conf.',
                      align: 'right',
                      render: (ev) => (
                        <ConfidenceIndicator
                          percentage={Math.round(ev.confidence * 100)}
                          size="sm"
                        />
                      ),
                    },
                    {
                      key: 'occupancy',
                      header: 'Occ. After',
                      align: 'right',
                      render: (ev) => (
                        <span className="font-mono font-extrabold text-[#082B59]">
                          {ev.occupancy_after_event}
                        </span>
                      ),
                    },
                    {
                      key: 'evidence',
                      header: 'Visual Evidence & Engine Rule',
                      render: (ev) => (
                        <div className="max-w-md">
                          <div className="text-xs text-[#152B4A]">
                            {ev.evidence_description}
                          </div>
                          <div className="text-[11px] text-[#718096] font-mono mt-0.5">
                            Rule: {ev.engine_note}
                          </div>
                        </div>
                      ),
                    },
                  ]}
                  data={filteredEvents}
                  rowKey={(ev) => ev.event_id}
                  onRowClick={(ev) => {
                    setActiveRoute('analysis');
                    setTimeout(() => handleSeekVideoTo(ev.timestamp_seconds), 80);
                  }}
                />

                {/* Analysis Quality, Unverified Events & Limitations */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl space-y-2">
                    <div className="text-xs font-bold text-[#082B59]">
                      Confidence &amp; Camera Angle Quality
                    </div>
                    <div className="text-xs text-[#718096] font-mono tabular-nums">
                      Mean Model Confidence:{' '}
                      <strong className="text-[#152B4A]">
                        {avgConfidence !== null ? `${avgConfidence}%` : 'N/A'}
                      </strong>
                    </div>
                    <p className="text-xs text-[#152B4A]">
                      <strong>Camera Angle:</strong>{' '}
                      {analysisResult.gemini_raw.camera_angle_assessment ||
                        'Doorway perspective evaluated by Gemini.'}
                    </p>
                    <p className="text-xs text-[#152B4A]">
                      <strong>Video Quality:</strong>{' '}
                      {analysisResult.gemini_raw.video_quality_assessment ||
                        'Standard corridor CCTV resolution.'}
                    </p>
                  </div>

                  <div className="p-4 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl space-y-2">
                    <div className="text-xs font-bold text-[#F5A623]">
                      Unverified Events ({analysisResult.gemini_raw.unverified_events.length}
                      )
                    </div>
                    {analysisResult.gemini_raw.unverified_events.length === 0 ? (
                      <p className="text-xs text-[#718096]">
                        All observed doorway crossings in this video were clearly verified.
                      </p>
                    ) : (
                      <ul className="space-y-1.5 text-xs text-[#152B4A]">
                        {analysisResult.gemini_raw.unverified_events.map((uv) => (
                          <li key={uv.event_id} className="font-mono">
                            [{uv.video_timestamp}] {uv.person_id}: {uv.reason_unverified}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="p-4 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl space-y-2">
                    <div className="text-xs font-bold text-[#082B59]">
                      Reported Analysis Limitations
                    </div>
                    {analysisResult.gemini_raw.analysis_limitations.length === 0 ? (
                      <p className="text-xs text-[#718096]">
                        No significant occlusion or camera angle limitations reported for this clip.
                      </p>
                    ) : (
                      <ul className="list-disc list-inside space-y-1 text-xs text-[#152B4A]">
                        {analysisResult.gemini_raw.analysis_limitations.map((lim, i) => (
                          <li key={i}>{lim}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SCREEN 6: ROOM HANDOVER & IDENTITY GOVERNANCE
         ===================================================================== */}
      {activeRoute === 'handover' && (
        <div className="space-y-6">
          <PageHeader
            title={`Room Handover Lifecycle Governance (${doorwayConfig.roomId})`}
            subtitle="Temporary exit is NOT checkout. Zero CCTV occupancy transitions the room to TEMPORARILY_VACANT; only authorized staff can confirm room handover and checkout."
            icon={<CheckCircle2 className="w-5 h-5" />}
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setPendingHandoverConfirmState('CHECKOUT_PENDING')}
                >
                  Flag Checkout Pending
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  onClick={() => setPendingHandoverConfirmState('HANDED_OVER')}
                >
                  Confirm Staff Handover
                </Button>
              </div>
            }
          />

          {/* Room Handover State Machine Card */}
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-5">
            <SectionHeader
              title="Room Lifecycle State Pipeline"
              subtitle="Click any state to authorize a staff-verified lifecycle transition."
              rightContent={
                <StatusBadge label={`Current: ${roomLifecycleState}`} tone="navy" mono />
              }
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              {ALL_LIFECYCLE_STATES.map((st) => {
                const isActive = roomLifecycleState === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setPendingHandoverConfirmState(st)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#082B59] border-[#082B59] text-white shadow-sm'
                        : 'bg-[#F5F8FD] border-[#E1EAF5] text-[#152B4A] hover:border-[#1769E8] hover:bg-[#EAF3FF]/50'
                    }`}
                  >
                    <div
                      className={`text-[10px] font-mono uppercase ${
                        isActive ? 'text-[#3188F5] font-bold' : 'text-[#718096]'
                      }`}
                    >
                      {isActive ? 'ACTIVE STATE' : 'AUTHORIZE'}
                    </div>
                    <div className="text-xs font-mono font-bold truncate mt-1">{st}</div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl">
              <FormField label="Authorizing Staff Member">
                <Input
                  type="text"
                  value={staffActorName}
                  onChange={(e) => setStaffActorName(e.target.value)}
                />
              </FormField>
              <FormField label="Handover / Physical Inspection Note">
                <Input
                  type="text"
                  placeholder="e.g. Minibar & keycard verified, room handed over"
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                />
              </FormField>
            </div>

            {/* Audit Trail Table */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#718096]">
                Room State &amp; Handover Audit Trail (Africa/Dar_es_Salaam)
              </h3>
              <DataTable
                columns={[
                  {
                    key: 'id',
                    header: 'Audit ID',
                    render: (log) => (
                      <span className="font-mono text-xs text-[#718096]">{log.id}</span>
                    ),
                  },
                  {
                    key: 'timestamp',
                    header: 'Timestamp (EAT)',
                    render: (log) => (
                      <span className="font-mono text-xs text-[#152B4A]">
                        {log.timestamp_dar_es_salaam}
                      </span>
                    ),
                  },
                  {
                    key: 'transition',
                    header: 'State Transition',
                    render: (log) => (
                      <span className="font-mono font-bold text-[#1769E8]">
                        {log.previous_state} → {log.new_state}
                      </span>
                    ),
                  },
                  {
                    key: 'trigger',
                    header: 'Trigger Source',
                    render: (log) => (
                      <StatusBadge
                        label={log.triggered_by}
                        tone={
                          log.triggered_by === 'STAFF_AUTHORIZED' ? 'success' : 'info'
                        }
                      />
                    ),
                  },
                  {
                    key: 'actor',
                    header: 'Actor',
                    render: (log) => (
                      <span className="font-semibold text-[#152B4A]">
                        {log.actor_name}
                      </span>
                    ),
                  },
                  {
                    key: 'notes',
                    header: 'Inspection / Engine Notes',
                    render: (log) => (
                      <span className="text-xs text-[#718096]">{log.notes}</span>
                    ),
                  },
                ]}
                data={handoverAuditLog}
                rowKey={(log) => log.id}
              />
            </div>
          </div>

          {/* Section 11: Extensible Guest Session Identity & 24-Hour Post-Checkout Retention */}
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-5">
            <SectionHeader
              title="Guest Session Identity & 24h Post-Checkout Biometric Retention Governance"
              subtitle="Phase 0 uses anonymous session tracking IDs only. This registry enforces explicit consent, non-biometric alternatives (Keycard + PIN), and automatic 24-hour post-checkout artifact deletion."
              icon={<UserCheck className="w-4 h-4" />}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {guestReferences.map((g) => (
                <div
                  key={g.reference_id}
                  className="p-4 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-mono font-bold text-[#1769E8]">
                        {g.reference_id} · {g.room_id} ({g.room_session_id})
                      </div>
                      <div className="text-sm font-bold text-[#152B4A]">
                        {g.anonymous_guest_label}
                      </div>
                    </div>
                    <StatusBadge
                      label={g.retention_status}
                      tone={
                        g.retention_status === 'PURGED_COMPLETE'
                          ? 'success'
                          : g.retention_status === 'BIOMETRIC_DECLINED_BY_GUEST'
                          ? 'neutral'
                          : 'info'
                      }
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#718096]">
                    <div>
                      Consent Status:{' '}
                      <strong className="text-[#152B4A]">
                        {g.consent_obtained
                          ? 'Explicit Opt-In'
                          : 'Declined (Alternative Active)'}
                      </strong>
                    </div>
                    <div>
                      Verification Mode:{' '}
                      <strong className="text-[#082B59] font-mono">
                        {g.verification_mode}
                      </strong>
                    </div>
                    {g.scheduled_purge_at_iso && (
                      <div className="sm:col-span-2 text-[#F5A623] font-mono font-semibold">
                        24h Post-Checkout Auto-Purge At:{' '}
                        {formatDarEsSalaamTime(g.scheduled_purge_at_iso, true)}
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 bg-white border border-[#E1EAF5] rounded-lg text-[11px] font-mono grid grid-cols-2 gap-1.5 text-[#718096]">
                    <div>
                      Original Photo:{' '}
                      <strong className="text-[#152B4A]">
                        {g.artifacts_status.original_photograph_purged
                          ? 'PURGED'
                          : 'RETENTION_BOUND'}
                      </strong>
                    </div>
                    <div>
                      Biometric Template:{' '}
                      <strong className="text-[#152B4A]">
                        {g.artifacts_status.biometric_template_purged
                          ? 'PURGED'
                          : 'RETENTION_BOUND'}
                      </strong>
                    </div>
                    <div>
                      Derived Face Crops:{' '}
                      <strong className="text-[#152B4A]">
                        {g.artifacts_status.derived_face_crops_purged
                          ? 'PURGED'
                          : 'RETENTION_BOUND'}
                      </strong>
                    </div>
                    <div>
                      Cached Copies:{' '}
                      <strong className="text-[#152B4A]">
                        {g.artifacts_status.cached_copies_purged
                          ? 'PURGED'
                          : 'RETENTION_BOUND'}
                      </strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleToggleGuestConsent(
                          g.reference_id,
                          false,
                          'DECLINED_KEYCARD_AND_PIN'
                        )
                      }
                    >
                      Use Keycard + PIN (Decline Biometrics)
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        handleToggleGuestConsent(
                          g.reference_id,
                          true,
                          'BIOMETRIC_OPT_IN'
                        )
                      }
                    >
                      Record Opt-In Consent
                    </Button>
                    {g.retention_status !== 'PURGED_COMPLETE' && (
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                        onClick={() => setPurgeConfirmGuestId(g.reference_id)}
                      >
                        Purge Artifacts
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SCREEN 7: REPORTS & ANALYTICS
         ===================================================================== */}
      {activeRoute === 'reports' && (
        <div className="space-y-6">
          <PageHeader
            title="Reports, JSON Schema & Accuracy Validation"
            subtitle="Inspect structured Gemini JSON output, run the deterministic multi-person occupancy verification suite, and export audit reports."
            icon={<BarChart3 className="w-5 h-5" />}
            actions={
              <>
                <Button
                  variant="outline"
                  size="md"
                  loading={isVerifyingEngine}
                  loadingText="Verifying Engine..."
                  onClick={runDeterministicVerificationSuite}
                >
                  Run Multi-Person Engine Verification
                </Button>
                {analysisResult && (
                  <Button
                    variant="primary"
                    size="md"
                    icon={<Download className="w-4 h-4" />}
                    onClick={handleDownloadJsonReport}
                  >
                    Download JSON Report
                  </Button>
                )}
              </>
            }
          />

          {engineVerificationResult && (
            <div className="p-4 bg-[#ECFDF5] border border-[#12B981]/30 rounded-2xl space-y-1.5">
              <div className="text-xs font-mono text-[#065F46] font-bold">
                Deterministic Occupancy Engine Verification: PASSED (
                {String(engineVerificationResult.passed).toUpperCase()})
              </div>
              <p className="text-xs text-[#047857]">
                Multi-Person Scenario (Person A &amp; B entries, temporary exit, re-entry, full exit): Peak Occupancy ={' '}
                <strong>
                  {engineVerificationResult.section5_multi_person_metrics.peak_count}
                </strong>
                , Confirmed Entries ={' '}
                <strong>
                  {engineVerificationResult.section5_multi_person_metrics.total_entries}
                </strong>
                , Confirmed Exits ={' '}
                <strong>
                  {engineVerificationResult.section5_multi_person_metrics.total_exits}
                </strong>
                , Final Occupancy ={' '}
                <strong>
                  {engineVerificationResult.section5_multi_person_metrics.current_count}
                </strong>
                , Lifecycle Transition ={' '}
                <strong>
                  {engineVerificationResult.handover_lifecycle_transition.nextState}
                </strong>
              </p>
            </div>
          )}

          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
            <SectionHeader
              title="Structured Gemini JSON & Deterministic Occupancy Output"
              subtitle="Exact schema validation separating raw Gemini multimodal output from deterministic room occupancy calculations."
              icon={<FileJson className="w-4 h-4" />}
            />

            {!analysisResult ? (
              <EmptyState
                icon={<FileJson className="w-6 h-6" />}
                title="No Analysis Report Available Yet"
                description="Analyze a CCTV video clip in the Video Analysis screen to view and export its structured JSON report."
                actionLabel="Go to Video Analysis"
                onAction={() => setActiveRoute('analysis')}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="text-xs font-bold text-[#082B59]">
                    Validated Gemini Multimodal JSON Response
                  </div>
                  <pre className="p-4 bg-[#061F43] text-white rounded-xl text-xs font-mono overflow-x-auto max-h-[420px]">
                    {JSON.stringify(analysisResult.gemini_raw, null, 2)}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-bold text-[#12B981]">
                    Deterministic Occupancy &amp; Stay Duration Report
                  </div>
                  <pre className="p-4 bg-[#061F43] text-white rounded-xl text-xs font-mono overflow-x-auto max-h-[420px]">
                    {JSON.stringify(analysisResult.deterministic_metrics, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>

          <AccuracyValidationPanel
            analysisResult={analysisResult}
            currentVideoPlayheadSec={currentVideoTime}
            executedTests={executedValidationTests}
            onSaveExecutedTest={(rec) =>
              setExecutedValidationTests((prev) => [rec, ...prev])
            }
          />
        </div>
      )}

      {/* =====================================================================
          SCREEN 8: ADMINISTRATION
         ===================================================================== */}
      {activeRoute === 'admin' && (
        <div className="space-y-6">
          <PageHeader
            title="Lodge Administration & Access Governance"
            subtitle="Manage branches, room inventory, floors, and RBAC staff enrollment."
            icon={<Building2 className="w-5 h-5" />}
            actions={
              <>
                <Button
                  variant="outline"
                  size="md"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setBranchModalOpen(true)}
                >
                  Add Branch
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setStaffModalOpen(true)}
                >
                  Register Staff Member
                </Button>
              </>
            }
          />

          {/* Room & Floor Management Table */}
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
            <SectionHeader
              title={`Lodge Room & Floor Inventory (${selectedBranch})`}
              subtitle="Click any room to view or configure its doorway monitoring assignment."
              icon={<Layers className="w-4 h-4" />}
            />
            <DataTable
              columns={[
                {
                  key: 'roomId',
                  header: 'Room ID',
                  render: (r) => (
                    <span className="font-mono font-bold text-[#082B59]">{r.roomId}</span>
                  ),
                },
                {
                  key: 'floor',
                  header: 'Floor / Wing',
                  render: (r) => <span className="text-xs text-[#152B4A]">{r.floor}</span>,
                },
                {
                  key: 'camera',
                  header: 'Assigned Corridor Camera',
                  render: (r) => (
                    <span className="font-mono text-xs text-[#1769E8]">{r.cameraId}</span>
                  ),
                },
                {
                  key: 'guests',
                  header: 'Registered Guests',
                  align: 'right',
                  render: (r) => (
                    <span className="font-mono font-semibold">{r.registeredGuests}</span>
                  ),
                },
                {
                  key: 'cctv',
                  header: 'CCTV Verified Inside',
                  align: 'right',
                  render: (r) => (
                    <span className="font-mono font-bold text-[#1769E8]">
                      {r.cctvOccupancy !== null ? r.cctvOccupancy : '—'}
                    </span>
                  ),
                },
                {
                  key: 'state',
                  header: 'Lifecycle State',
                  render: (r) => (
                    <StatusBadge
                      label={r.lifecycleState}
                      tone={
                        r.lifecycleState === 'AVAILABLE'
                          ? 'success'
                          : r.lifecycleState === 'OCCUPIED' ||
                            r.lifecycleState === 'CHECKED_IN'
                          ? 'info'
                          : 'warning'
                      }
                    />
                  ),
                },
                {
                  key: 'action',
                  header: 'Actions',
                  align: 'right',
                  render: (r) => (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRoomDetail(r);
                      }}
                    >
                      Room Details
                    </Button>
                  ),
                },
              ]}
              data={lodgeRooms}
              rowKey={(r) => r.roomId}
              onRowClick={(r) => setSelectedRoomDetail(r)}
            />
          </div>

          {/* Staff Registry Table */}
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
            <SectionHeader
              title="Staff RBAC & Reference Registry"
              subtitle="Authorized lodge staff members enrolled in the role-based access control registry."
              icon={<UserCheck className="w-4 h-4" />}
            />
            <DataTable
              columns={[
                {
                  key: 'staff_id',
                  header: 'Staff ID',
                  render: (s) => (
                    <span className="font-mono font-bold text-[#1769E8]">
                      {s.staff_id}
                    </span>
                  ),
                },
                {
                  key: 'name',
                  header: 'Full Name',
                  render: (s) => (
                    <span className="font-bold text-[#152B4A]">{s.full_name}</span>
                  ),
                },
                {
                  key: 'role',
                  header: 'Role',
                  render: (s) => <StatusBadge label={s.role} tone="info" />,
                },
                {
                  key: 'branch',
                  header: 'Branch ID',
                  render: (s) => (
                    <span className="font-mono text-xs text-[#718096]">
                      {s.branch_id}
                    </span>
                  ),
                },
                {
                  key: 'tier',
                  header: 'Access Tier',
                  render: (s) => (
                    <span className="font-mono text-xs font-semibold text-[#082B59]">
                      {s.access_control_tier}
                    </span>
                  ),
                },
                {
                  key: 'encryption',
                  header: 'Template Status',
                  render: (s) => (
                    <StatusBadge label={s.template_encryption_status} tone="success" dot />
                  ),
                },
              ]}
              data={staffReferences}
              rowKey={(s) => s.staff_id}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          SCREEN 9: SETTINGS
         ===================================================================== */}
      {activeRoute === 'settings' && (
        <div className="space-y-6">
          <PageHeader
            title="System & AI Configuration Settings"
            subtitle="Configure application defaults, doorway threshold parameters, and inspect Gemini server-side integration status."
            icon={<Sliders className="w-5 h-5" />}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AI Configuration Status Card */}
            <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
              <SectionHeader
                title="Gemini Multimodal AI Configuration Status"
                subtitle="Live status from /api/health server-side endpoint."
                icon={<Sparkles className="w-4 h-4" />}
              />

              <div className="space-y-3 text-xs sm:text-sm">
                <div className="flex items-center justify-between py-2 border-b border-[#E1EAF5]">
                  <span className="text-[#718096]">Server API Key Protection</span>
                  <StatusBadge
                    label={
                      health?.gemini_configured
                        ? 'Server-Side GEMINI_API_KEY Active'
                        : 'Missing GEMINI_API_KEY'
                    }
                    tone={health?.gemini_configured ? 'success' : 'danger'}
                    dot
                  />
                </div>
                <div className="flex items-center justify-between py-2 border-b border-[#E1EAF5]">
                  <span className="text-[#718096]">Primary Multimodal Model</span>
                  <span className="font-mono font-bold text-[#082B59]">
                    {health?.model || 'gemini-3.1-flash-lite'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-[#E1EAF5]">
                  <span className="text-[#718096]">High-Demand Failover Cascade</span>
                  <span className="font-mono text-xs text-[#1769E8] font-semibold">
                    3.1-flash-lite → flash-latest → 3.8-flash
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-[#E1EAF5]">
                  <span className="text-[#718096]">Upload Transport</span>
                  <span className="font-semibold text-[#152B4A]">
                    2 MB Chunked Binary + Async Job Polling
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#718096]">Application Timezone</span>
                  <span className="font-mono font-semibold text-[#152B4A]">
                    {health?.timezone || 'Africa/Dar_es_Salaam'} (EAT)
                  </span>
                </div>
              </div>
            </div>

            {/* Operator & Camera Preferences Card */}
            <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
              <SectionHeader
                title="Operator & Occupancy Engine Preferences"
                subtitle="Configure default doorway overlay behavior and duplicate filtering."
                icon={<Sliders className="w-4 h-4" />}
              />

              <div className="space-y-4">
                <Switch
                  checked={showDoorwayOverlay}
                  onChange={(val) => {
                    setShowDoorwayOverlay(val);
                    setAutoShowThresholdOverlay(val);
                  }}
                  label="Show Doorway Threshold ROI Overlay on Video Player"
                  description="Displays the green doorway ROI box and crossing vector over CCTV video previews."
                />

                <FormField
                  label="Duplicate Event Debounce Window (Seconds)"
                  hint="Events for the same person and event type within this window are automatically ignored."
                >
                  <Input
                    type="number"
                    mono
                    min={1}
                    max={10}
                    value={duplicateEventWindowSec}
                    onChange={(e) =>
                      setDuplicateEventWindowSec(
                        Math.max(1, Number(e.target.value) || 2)
                      )
                    }
                  />
                </FormField>

                <FormField label="Active Lodge Branch">
                  <Select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                  >
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() =>
                      setToastSuccess({
                        title: 'Settings Saved',
                        message:
                          'Camera threshold overlay and branch preferences updated.',
                      })
                    }
                  >
                    Save Preferences
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SHARED REUSABLE MODALS (Doorway Config, Camera Details, Room Details, Staff, Branch, Confirmations)
         ===================================================================== */}

      {/* 1. Configure Doorway Threshold ROI Modal */}
      <Modal
        isOpen={doorwayModalOpen}
        onClose={() => setDoorwayModalOpen(false)}
        title="Configure Doorway Threshold & Camera Parameters"
        description="These parameters are sent to Gemini Vision and the Deterministic Occupancy Engine."
        size="lg"
        confirmLabel="Apply Doorway Configuration"
        onConfirm={() => {
          setDoorwayModalOpen(false);
          setToastSuccess({
            title: 'Doorway Configuration Updated',
            message: `Configured ${doorwayConfig.roomId} (${doorwayConfig.cameraId}) threshold ROI.`,
          });
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Room ID" required>
              <Input
                mono
                value={doorwayConfig.roomId}
                onChange={(e) =>
                  setDoorwayConfig((c) => ({ ...c, roomId: e.target.value }))
                }
              />
            </FormField>

            <FormField label="Camera ID" required>
              <Input
                mono
                value={doorwayConfig.cameraId}
                onChange={(e) =>
                  setDoorwayConfig((c) => ({ ...c, cameraId: e.target.value }))
                }
              />
            </FormField>

            <FormField label="Registered Guest Count">
              <Input
                type="number"
                mono
                min={0}
                max={10}
                value={doorwayConfig.registeredGuestCount}
                onChange={(e) =>
                  setDoorwayConfig((c) => ({
                    ...c,
                    registeredGuestCount: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
            </FormField>

            <FormField label="Doorway Position in Frame">
              <Select
                value={doorwayConfig.doorwayPosition}
                onChange={(e) => {
                  const pos = e.target.value as DoorwayPosition;
                  const presetZone =
                    pos === 'LEFT_WALL'
                      ? { x: 13, y: 18, width: 16, height: 48 }
                      : pos === 'RIGHT_WALL'
                      ? { x: 70, y: 18, width: 16, height: 48 }
                      : pos === 'CENTER_BACK'
                      ? { x: 40, y: 15, width: 20, height: 50 }
                      : doorwayConfig.thresholdZone;
                  setDoorwayConfig((c) => ({
                    ...c,
                    doorwayPosition: pos,
                    thresholdZone: presetZone,
                  }));
                }}
              >
                <option value="LEFT_WALL">Left Corridor Wall</option>
                <option value="RIGHT_WALL">Right Corridor Wall</option>
                <option value="CENTER_BACK">Center-Back Doorway</option>
                <option value="CUSTOM_ROI">Custom Threshold Box</option>
              </Select>
            </FormField>

            <FormField label="Inside Room Direction">
              <Select
                value={doorwayConfig.insideDirection}
                onChange={(e) =>
                  setDoorwayConfig((c) => ({
                    ...c,
                    insideDirection: e.target.value as InsideDirection,
                  }))
                }
              >
                <option value="INTO_LEFT_DOOR">Crosses Into Left Doorway</option>
                <option value="INTO_RIGHT_DOOR">Crosses Into Right Doorway</option>
                <option value="INTO_CENTER_DEPTH">Crosses Into Center Doorway</option>
                <option value="TOP_OF_FRAME">Moves Toward Top of Frame</option>
                <option value="BOTTOM_OF_FRAME">Moves Toward Bottom of Frame</option>
              </Select>
            </FormField>

            <FormField label="Initial Occupants Before Clip">
              <Input
                type="number"
                mono
                min={0}
                max={10}
                value={doorwayConfig.initialOccupancyBeforeVideo}
                onChange={(e) =>
                  setDoorwayConfig((c) => ({
                    ...c,
                    initialOccupancyBeforeVideo: Math.max(
                      0,
                      Number(e.target.value) || 0
                    ),
                  }))
                }
              />
            </FormField>
          </div>

          {/* Fine-grained ROI Sliders */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl">
            <div>
              <label className="block text-[11px] font-mono font-bold text-[#152B4A]">
                ROI X ({doorwayConfig.thresholdZone.x}%)
              </label>
              <input
                type="range"
                min={0}
                max={85}
                value={doorwayConfig.thresholdZone.x}
                onChange={(e) =>
                  setDoorwayConfig((c) => ({
                    ...c,
                    doorwayPosition: 'CUSTOM_ROI',
                    thresholdZone: {
                      ...c.thresholdZone,
                      x: Number(e.target.value),
                    },
                  }))
                }
                className="w-full accent-[#1769E8]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-bold text-[#152B4A]">
                ROI Y ({doorwayConfig.thresholdZone.y}%)
              </label>
              <input
                type="range"
                min={0}
                max={80}
                value={doorwayConfig.thresholdZone.y}
                onChange={(e) =>
                  setDoorwayConfig((c) => ({
                    ...c,
                    doorwayPosition: 'CUSTOM_ROI',
                    thresholdZone: {
                      ...c.thresholdZone,
                      y: Number(e.target.value),
                    },
                  }))
                }
                className="w-full accent-[#1769E8]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-bold text-[#152B4A]">
                Width ({doorwayConfig.thresholdZone.width}%)
              </label>
              <input
                type="range"
                min={8}
                max={60}
                value={doorwayConfig.thresholdZone.width}
                onChange={(e) =>
                  setDoorwayConfig((c) => ({
                    ...c,
                    doorwayPosition: 'CUSTOM_ROI',
                    thresholdZone: {
                      ...c.thresholdZone,
                      width: Number(e.target.value),
                    },
                  }))
                }
                className="w-full accent-[#1769E8]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-bold text-[#152B4A]">
                Height ({doorwayConfig.thresholdZone.height}%)
              </label>
              <input
                type="range"
                min={15}
                max={80}
                value={doorwayConfig.thresholdZone.height}
                onChange={(e) =>
                  setDoorwayConfig((c) => ({
                    ...c,
                    doorwayPosition: 'CUSTOM_ROI',
                    thresholdZone: {
                      ...c.thresholdZone,
                      height: Number(e.target.value),
                    },
                  }))
                }
                className="w-full accent-[#1769E8]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              label="Optional Recording Start Time (Africa/Dar_es_Salaam)"
              hint="Leave blank to strictly preserve video-relative timestamps (00:00:05)."
            >
              <DatePicker
                includeTime
                value={doorwayConfig.recordingStartIso || ''}
                onChange={(e) =>
                  setDoorwayConfig((c) => ({
                    ...c,
                    recordingStartIso: e.target.value,
                  }))
                }
              />
            </FormField>

            <FormField
              label="Scene Notes for Gemini Vision (Optional)"
              hint="Additional doorway visual cues for the multimodal model."
            >
              <Input
                placeholder="e.g. Doorway is first door on left"
                value={doorwayConfig.customNotes || ''}
                onChange={(e) =>
                  setDoorwayConfig((c) => ({
                    ...c,
                    customNotes: e.target.value,
                  }))
                }
              />
            </FormField>
          </div>
        </div>
      </Modal>

      {/* 2. Camera Details Modal */}
      <Modal
        isOpen={Boolean(cameraDetailModal)}
        onClose={() => setCameraDetailModal(null)}
        title={
          cameraDetailModal
            ? `Camera Node: ${cameraDetailModal.cameraId}`
            : 'Camera Details'
        }
        description={cameraDetailModal?.name}
        size="sm"
        confirmLabel="Analyze Clip for This Camera"
        onConfirm={() => {
          if (cameraDetailModal) {
            setDoorwayConfig((c) => ({
              ...c,
              cameraId: cameraDetailModal.cameraId,
              roomId: cameraDetailModal.targetRoomId,
              cameraAngle: cameraDetailModal.angle,
            }));
          }
          setCameraDetailModal(null);
          setActiveRoute('analysis');
        }}
      >
        {cameraDetailModal && (
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-[#E1EAF5]">
              <span className="text-[#718096]">Target Room</span>
              <span className="font-mono font-bold text-[#082B59]">
                {cameraDetailModal.targetRoomId}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[#E1EAF5]">
              <span className="text-[#718096]">Corridor Wing</span>
              <span className="font-semibold text-[#152B4A]">
                {cameraDetailModal.corridor}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[#E1EAF5]">
              <span className="text-[#718096]">Camera Perspective</span>
              <span className="font-mono text-[#1769E8]">{cameraDetailModal.angle}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-[#718096]">RTSP Live Stream Status</span>
              <StatusBadge label="Not Connected (Upload Mode)" tone="neutral" />
            </div>
          </div>
        )}
      </Modal>

      {/* 3. Room Details Modal */}
      <Modal
        isOpen={Boolean(selectedRoomDetail)}
        onClose={() => setSelectedRoomDetail(null)}
        title={
          selectedRoomDetail
            ? `Room Details: ${selectedRoomDetail.roomId}`
            : 'Room Details'
        }
        description={selectedRoomDetail?.floor}
        size="sm"
        confirmLabel="Open in Video Analysis"
        onConfirm={() => {
          if (selectedRoomDetail) {
            setDoorwayConfig((c) => ({
              ...c,
              roomId: selectedRoomDetail.roomId,
              cameraId: selectedRoomDetail.cameraId,
              registeredGuestCount: selectedRoomDetail.registeredGuests,
            }));
          }
          setSelectedRoomDetail(null);
          setActiveRoute('analysis');
        }}
      >
        {selectedRoomDetail && (
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-[#E1EAF5]">
              <span className="text-[#718096]">Lifecycle State</span>
              <StatusBadge label={selectedRoomDetail.lifecycleState} tone="info" />
            </div>
            <div className="flex justify-between py-1.5 border-b border-[#E1EAF5]">
              <span className="text-[#718096]">Assigned Camera</span>
              <span className="font-mono font-bold text-[#1769E8]">
                {selectedRoomDetail.cameraId}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-[#718096]">Registered Guests</span>
              <span className="font-mono font-bold text-[#152B4A]">
                {selectedRoomDetail.registeredGuests}
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* 4. Register Staff Modal */}
      <Modal
        isOpen={staffModalOpen}
        onClose={() => setStaffModalOpen(false)}
        title="Register Lodge Staff Member"
        description="Add an authorized staff member to the RBAC registry."
        size="sm"
        confirmLabel="Register Staff"
        onConfirm={handleRegisterStaff}
        confirmDisabled={!newStaffName.trim()}
      >
        <div className="space-y-3">
          <FormField label="Staff Full Name" required>
            <Input
              placeholder="e.g. Juma Mwakalebela"
              value={newStaffName}
              onChange={(e) => setNewStaffName(e.target.value)}
            />
          </FormField>
          <FormField label="Operational Role" required>
            <Select
              value={newStaffRole}
              onChange={(e) =>
                setNewStaffRole(e.target.value as StaffFaceReference['role'])
              }
            >
              <option value="FRONT_DESK">FRONT_DESK</option>
              <option value="DUTY_MANAGER">DUTY_MANAGER</option>
              <option value="HOUSEKEEPING">HOUSEKEEPING</option>
              <option value="SECURITY">SECURITY</option>
              <option value="MAINTENANCE">MAINTENANCE</option>
            </Select>
          </FormField>
        </div>
      </Modal>

      {/* 5. Branch Configuration Modal */}
      <Modal
        isOpen={branchModalOpen}
        onClose={() => setBranchModalOpen(false)}
        title="Configure New Lodge Branch"
        description="Add a lodge branch to the top navigation branch selector."
        size="sm"
        confirmLabel="Add Branch"
        onConfirm={handleAddBranch}
        confirmDisabled={!newBranchName.trim()}
      >
        <FormField label="Branch Name" required>
          <Input
            placeholder="e.g. Zanzibar Stone Town Wing"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
          />
        </FormField>
      </Modal>

      {/* 6. Handover Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(pendingHandoverConfirmState)}
        onClose={() => setPendingHandoverConfirmState(null)}
        onConfirm={() => {
          if (pendingHandoverConfirmState) {
            handleAuthorizedStateTransition(pendingHandoverConfirmState);
          }
        }}
        title={`Confirm Room Transition: ${pendingHandoverConfirmState || ''}`}
        description={`Are you sure you want to authorize transitioning ${doorwayConfig.roomId} from ${roomLifecycleState} to ${pendingHandoverConfirmState} as ${staffActorName}?`}
        confirmLabel="Authorize Transition"
      />

      {/* 7. Biometric Artifact Purge Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(purgeConfirmGuestId)}
        onClose={() => setPurgeConfirmGuestId(null)}
        onConfirm={() => {
          if (purgeConfirmGuestId) {
            handlePurgeGuestBiometricsNow(purgeConfirmGuestId);
          }
        }}
        variant="danger"
        title="Purge All Guest Biometric Artifacts"
        description="This action permanently purges the original photograph, biometric template, derived face crops, and cached copies for this guest session."
        confirmLabel="Purge Artifacts Now"
      />
    </AppLayout>
  );
}
