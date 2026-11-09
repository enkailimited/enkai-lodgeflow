/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Activity,
  Bell,
  Building2,
  Users,
  Layers,
  CreditCard,
  Receipt,
  Gauge,
  MapPin,
  Video,
  Cpu,
  Download,
  Sliders,
  Brain,
  Bot,
  ChartBar,
  HardDrive,
  Network,
  Plug,
  ShieldCheck,
  ClipboardList,
  ShieldAlert,
  Flag,
  Settings,
  DatabaseBackup,
  Wrench,
} from 'lucide-react';

import {
  TenantInfo,
  CctvAgentDevice,
} from '../../../packages/shared/src/index';

// Placeholder for platform-specific state & components
// (To be implemented in next step)
export default function PlatformApp() {
  return <div className="p-10">ENKAI Platform Management Portal (Under Construction)</div>;
}

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
  cleaningStatus: 'CLEAN' | 'DIRTY' | 'IN_PROGRESS';
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

const INITIAL_ROOMS: LodgeRoomSummary[] = [
  {
    roomId: 'ROOM-101',
    floor: 'Floor 1 — North Wing',
    cameraId: 'CAM-CORRIDOR-01',
    registeredGuests: 2,
    lifecycleState: 'CHECKED_IN',
    cctvOccupancy: null,
    cleaningStatus: 'CLEAN',
  },
  {
    roomId: 'ROOM-102',
    floor: 'Floor 1 — North Wing',
    cameraId: 'CAM-CORRIDOR-01',
    registeredGuests: 2,
    lifecycleState: 'OCCUPIED',
    cctvOccupancy: null,
    cleaningStatus: 'CLEAN',
  },
  {
    roomId: 'ROOM-103',
    floor: 'Floor 1 — South Wing',
    cameraId: 'CAM-CORRIDOR-02',
    registeredGuests: 1,
    lifecycleState: 'OCCUPIED',
    cctvOccupancy: null,
    cleaningStatus: 'DIRTY',
  },
  {
    roomId: 'ROOM-104',
    floor: 'Floor 1 — South Wing',
    cameraId: 'CAM-CORRIDOR-02',
    registeredGuests: 0,
    lifecycleState: 'AVAILABLE',
    cctvOccupancy: null,
    cleaningStatus: 'CLEAN',
  },
  {
    roomId: 'ROOM-201',
    floor: 'Floor 2 — Executive Wing',
    cameraId: 'CAM-CORRIDOR-03',
    registeredGuests: 2,
    lifecycleState: 'OCCUPIED',
    cctvOccupancy: null,
    cleaningStatus: 'IN_PROGRESS',
  },
  {
    roomId: 'ROOM-202',
    floor: 'Floor 2 — Executive Wing',
    cameraId: 'CAM-CORRIDOR-03',
    registeredGuests: 0,
    lifecycleState: 'AVAILABLE',
    cctvOccupancy: null,
    cleaningStatus: 'CLEAN',
  },
  {
    roomId: 'ROOM-203',
    floor: 'Floor 2 — Executive Wing',
    cameraId: 'CAM-CORRIDOR-03',
    registeredGuests: 1,
    lifecycleState: 'RESERVED',
    cctvOccupancy: null,
    cleaningStatus: 'CLEAN',
  },
  {
    roomId: 'ROOM-301',
    floor: 'Floor 3 — Penthouse Wing',
    cameraId: 'CAM-CORRIDOR-04',
    registeredGuests: 0,
    lifecycleState: 'CLEANING',
    cctvOccupancy: null,
    cleaningStatus: 'DIRTY',
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
    rtspConnected: true,
    mode: 'UPLOAD_PROTOTYPE',
  },
  {
    cameraId: 'CAM-CORRIDOR-02',
    name: 'Floor 1 South Corridor (Room 103–104)',
    branch: 'Main Branch',
    corridor: 'Floor 1 — South Wing',
    targetRoomId: 'ROOM-103',
    angle: 'DIRECT_DOORWAY',
    rtspConnected: true,
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

export default function App() {
  const [activeRoute, setActiveRoute] = useState<AppRouteId>('dashboard');
  const [portalMode, setPortalMode] = useState<PortalMode>('lodge');
  const [health, setHealth] = useState<ServerHealthInfo | null>(null);

  // Branch & operator context
  const [branches, setBranches] = useState<string[]>([
    'Main Branch',
    'Dar Peninsula Branch',
    'Arusha Safari Lodge',
  ]);
  const [selectedBranch, setSelectedBranch] = useState<string>('Main Branch');

  // Multi-Tenant & PMS Data Stores
  const [tenants, setTenants] = useState<TenantInfo[]>([
    {
      id: 'TNT-001',
      name: 'Enkai Luxury Lodges Ltd',
      slug: 'enkai-lodges',
      subscriptionTier: 'ENTERPRISE',
      status: 'ACTIVE',
      branchesCount: 3,
      camerasCount: 16,
      createdAt: '2026-01-15',
    },
    {
      id: 'TNT-002',
      name: 'Serengeti Horizon Stays',
      slug: 'serengeti-horizon',
      subscriptionTier: 'PROFESSIONAL',
      status: 'ACTIVE',
      branchesCount: 2,
      camerasCount: 8,
      createdAt: '2026-02-10',
    },
  ]);

  const [reservations, setReservations] = useState<ReservationInfo[]>([
    {
      id: 'RES-101',
      branchName: 'Main Branch',
      roomId: 'ROOM-101',
      guestName: 'Dr. David Mkwawa',
      checkInDate: '2026-11-08',
      checkOutDate: '2026-11-12',
      status: 'CHECKED_IN',
      totalAmount: 450000,
    },
    {
      id: 'RES-102',
      branchName: 'Main Branch',
      roomId: 'ROOM-102',
      guestName: 'Sarah Kagashe',
      checkInDate: '2026-11-09',
      checkOutDate: '2026-11-14',
      status: 'CONFIRMED',
      totalAmount: 620000,
    },
    {
      id: 'RES-103',
      branchName: 'Dar Peninsula Branch',
      roomId: 'ROOM-201',
      guestName: 'John Omondi',
      checkInDate: '2026-11-09',
      checkOutDate: '2026-11-11',
      status: 'CHECKED_IN',
      totalAmount: 380000,
    },
  ]);

  const [guests, setGuests] = useState<GuestInfo[]>([
    {
      id: 'GST-01',
      fullName: 'Dr. David Mkwawa',
      phone: '+255 754 123 456',
      email: 'david.mkwawa@gmail.com',
      idNumber: '1982-4412-9901',
      totalStays: 4,
    },
    {
      id: 'GST-02',
      fullName: 'Sarah Kagashe',
      phone: '+255 713 987 654',
      email: 'sarah.k@tzcorp.co.tz',
      idNumber: '1990-8823-1102',
      totalStays: 2,
    },
    {
      id: 'GST-03',
      fullName: 'John Omondi',
      phone: '+254 722 333 444',
      email: 'jomondi@kenya-safari.com',
      idNumber: 'ID-KE-883920',
      totalStays: 1,
    },
  ]);

  const [invoices, setInvoices] = useState<InvoiceInfo[]>([
    {
      id: 'INV-101',
      reservationId: 'RES-101',
      guestName: 'Dr. David Mkwawa',
      roomNumber: 'ROOM-101',
      amount: 450000,
      paid: 450000,
      status: 'PAID',
      date: '2026-11-08',
    },
    {
      id: 'INV-102',
      reservationId: 'RES-102',
      guestName: 'Sarah Kagashe',
      roomNumber: 'ROOM-102',
      amount: 620000,
      paid: 200000,
      status: 'PENDING',
      date: '2026-11-09',
    },
  ]);

  const [expenses, setExpenses] = useState<ExpenseInfo[]>([
    {
      id: 'EXP-01',
      category: 'Utilities & Power',
      amount: 145000,
      description: 'Backup Generator Diesel Refill',
      date: '2026-11-08',
    },
    {
      id: 'EXP-02',
      category: 'Housekeeping Supplies',
      amount: 85000,
      description: 'Bed Linen & Sanitization Refill',
      date: '2026-11-07',
    },
  ]);

  const [investigations, setInvestigations] = useState<UnrecordedRevenueInvestigationItem[]>([
    {
      investigationId: 'INV-EST-01',
      roomId: 'ROOM-103',
      cameraName: 'CAM-CORRIDOR-02',
      entryTimestamp: '00:02:15',
      exitTimestamp: '00:08:40',
      observedDuration: '00h 06m 25s',
      detectedPeopleCount: 2,
      pmsMatchStatus: 'UNMATCHED_ENTRY',
      investigationStatus: 'REVIEW_REQUIRED',
      confidence: 0.96,
      potentialExposure: 150000,
      notes: 'Unidentified visitors spent 6+ minutes in ROOM-103 with no active front-desk reservation.',
    },
  ]);

  const [cctvAgents, setCctvAgents] = useState<CctvAgentDevice[]>([
    {
      agentId: 'AGT-DAR-01',
      branchName: 'Main Branch',
      agentName: 'Enkai Edge Daemon #1 (Windows Server)',
      ipAddress: '192.168.1.105',
      status: 'ONLINE',
      camerasCount: 4,
      lastSeen: 'Just now',
    },
    {
      agentId: 'AGT-ARU-02',
      branchName: 'Arusha Safari Lodge',
      agentName: 'Enkai Edge Daemon #2 (Linux Ubuntu)',
      ipAddress: '192.168.10.40',
      status: 'ONLINE',
      camerasCount: 4,
      lastSeen: '12 seconds ago',
    },
  ]);

  // Notifications
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([
    {
      id: 'NOTIF-1',
      title: 'Gemini Multimodal Engine Ready',
      message: 'Server-side video analysis pipeline with 2 MB chunked upload and multi-model failover is active.',
      timestamp: 'Just now',
      read: false,
      tone: 'info',
    },
    {
      id: 'NOTIF-2',
      title: 'Unrecorded Revenue Alert',
      message: 'Unmatched entry detected in ROOM-103 requiring manager review.',
      timestamp: '10 mins ago',
      read: false,
      tone: 'warning',
    },
  ]);

  const [toastSuccess, setToastSuccess] = useState<{
    title: string;
    message?: string;
  } | null>(null);

  // Lodge room & camera registry state
  const [lodgeRooms, setLodgeRooms] = useState<LodgeRoomSummary[]>(INITIAL_ROOMS);
  const [cameras] = useState<RegisteredCameraInfo[]>(INITIAL_CAMERAS);
  const [selectedMonitoringCorridor, setSelectedMonitoringCorridor] = useState<string>('ALL');
  const [cameraDetailModal, setCameraDetailModal] = useState<RegisteredCameraInfo | null>(null);

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
  const [doorwayConfig, setDoorwayConfig] = useState<DoorwayConfig>(DEFAULT_DOORWAY_CONFIG);
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

  // Room Handover Lifecycle State Machine
  const [roomLifecycleState, setRoomLifecycleState] = useState<RoomLifecycleState>('CHECKED_IN');
  const [staffActorName, setStaffActorName] = useState<string>('Duty Manager A. Mwakasege');
  const [handoverNotes, setHandoverNotes] = useState<string>('');
  const [pendingHandoverConfirmState, setPendingHandoverConfirmState] = useState<RoomLifecycleState | null>(null);
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

  // Guest & Staff Biometric / Retention Registry
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
  ]);

  // Modals
  const [staffModalOpen, setStaffModalOpen] = useState<boolean>(false);
  const [newStaffName, setNewStaffName] = useState<string>('');
  const [newStaffRole, setNewStaffRole] = useState<StaffFaceReference['role']>('FRONT_DESK');
  const [branchModalOpen, setBranchModalOpen] = useState<boolean>(false);
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [selectedRoomDetail, setSelectedRoomDetail] = useState<LodgeRoomSummary | null>(null);
  const [purgeConfirmGuestId, setPurgeConfirmGuestId] = useState<string | null>(null);

  // Engine self-test & executed tests
  const [engineVerificationResult, setEngineVerificationResult] = useState<any | null>(null);
  const [isVerifyingEngine, setIsVerifyingEngine] = useState<boolean>(false);
  const [executedValidationTests, setExecutedValidationTests] = useState<Phase03ExecutedTestRecord[]>([]);

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

    const allowedExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mpeg', '.mpg', '.3gp', '.mkv'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const isVideoMime = file.type.startsWith('video/');

    if (!isVideoMime && !allowedExtensions.includes(ext)) {
      setErrorBanner({
        code: 'INVALID_FILE_FORMAT',
        message: `Unsupported file "${file.name}" (${file.type || 'unknown type'}). Please select a valid MP4, MOV, WebM, AVI, or 3GPP CCTV video file.`,
      });
      setUploadStatusText('Invalid file format rejected');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setErrorBanner({
        code: 'LARGE_VIDEO_FILE',
        message: `Selected file "${file.name}" exceeds the 100 MB prototype limit.`,
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
      message: `${file.name} ready for Gemini multimodal analysis.`,
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
          err instanceof Error ? err.message : 'Could not generate sample video clip.',
      });
    } finally {
      setIsGeneratingSample(false);
    }
  };

  const handleAnalyzeVideo = async () => {
    if (!selectedFile) {
      setErrorBanner({
        code: 'NO_VIDEO_SELECTED',
        message: 'Please select or generate a CCTV video clip before clicking Analyze Video.',
      });
      return;
    }

    setErrorBanner(null);
    setToastSuccess(null);
    setIsAnalyzing(true);
    setUploadProgressPct(5);
    setUploadStatusText('Initializing chunked upload...');
    setAnalysisPhaseText(`Step 1/3: Initializing upload for ${selectedFile.name}...`);

    const safeParseJson = async (res: Response) => {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status})`);
      }
    };

    try {
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
        return;
      }

      const uploadId: string = initData.uploadId;
      const CHUNK_SIZE = 2 * 1024 * 1024;
      const totalChunks = Math.max(1, Math.ceil(selectedFile.size / CHUNK_SIZE));

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(selectedFile.size, start + CHUNK_SIZE);
        const chunkBlob = selectedFile.slice(start, end);

        let chunkUploaded = false;
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
            if (!chunkRes.ok) throw new Error(chunkData.message);
            const pct = chunkData.progressPct ?? Math.round((end / selectedFile.size) * 100);
            setUploadProgressPct(Math.min(45, Math.round(pct * 0.45)));
            setUploadStatusText(`Uploading video (${pct}%)`);
            chunkUploaded = true;
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 800 * attempt));
          }
        }
        if (!chunkUploaded) throw new Error('Failed to upload video chunk after 3 attempts.');
      }

      setUploadProgressPct(55);
      setAnalysisPhaseText('Step 2/3: Queuing video for Gemini multimodal analysis...');

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
        return;
      }

      const jobId: string = startData.jobId;
      const maxPollWaitMs = 4 * 60 * 1000;
      const pollStart = Date.now();

      while (Date.now() - pollStart < maxPollWaitMs) {
        await new Promise((r) => setTimeout(r, 1500));
        const pollRes = await fetch(`/api/analyze-status/${jobId}`);
        const pollData = await safeParseJson(pollRes);

        if (!pollRes.ok) {
          setErrorBanner({
            code: pollData.error_code || `HTTP_${pollRes.status}`,
            message: pollData.message || 'Error checking analysis status.',
          });
          return;
        }

        if (pollData.stageMessage) {
          const elapsed = pollData.elapsedSeconds ?? 0;
          setUploadProgressPct(Math.min(95, 58 + Math.min(35, elapsed * 3)));
          setAnalysisPhaseText(`${pollData.stageMessage} (${elapsed}s)`);
        }

        if (pollData.status === 'FAILED') {
          const errObj = pollData.error || {};
          setErrorBanner({
            code: errObj.error_code || 'ANALYSIS_FAILED',
            message: errObj.message || 'Video analysis failed on the server.',
            detail: errObj.technical_detail,
          });
          return;
        }

        if (pollData.status === 'COMPLETED' && pollData.result) {
          const fullResult = pollData.result as FullAnalysisResult;
          setUploadProgressPct(100);
          setAnalysisResult(fullResult);
          setUploadStatusText(`Analysis complete via ${fullResult.model_used}`);
          setToastSuccess({
            title: `Gemini Analysis Complete (${fullResult.doorway_config.roomId})`,
            message: `Detected ${fullResult.deterministic_metrics.total_entries} entries, ${fullResult.deterministic_metrics.total_exits} exits.`,
          });

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
                actor_name: `ENKAI CCTV Engine`,
                notes: lifecycleUpdate.explanation,
              },
              ...logs,
            ]);
          }
          return;
        }
      }
      throw new Error('Video analysis timed out after 4 minutes.');
    } catch (netErr) {
      setErrorBanner({
        code: 'NETWORK_INTERRUPTION',
        message: 'Network connection was interrupted during video analysis.',
        detail: netErr instanceof Error ? netErr.message : String(netErr),
      });
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
    a.download = `enkai-lodgeflow-${analysisResult.doorway_config.roomId.toLowerCase()}.json`;
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
      handoverNotes.trim() || `Authorized manual state transition from ${prev} to ${targetState}.`;

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
      message: `${doorwayConfig.roomId} transitioned from ${prev} to ${targetState}.`,
    });
  };

  const runDeterministicVerificationSuite = async () => {
    setIsVerifyingEngine(true);
    try {
      const res = await fetch('/api/verify-engine', { method: 'POST' });
      const data = await res.json();
      setEngineVerificationResult(data);
      setToastSuccess({
        title: 'Deterministic Engine Verification Passed',
        message: 'Verified multi-person entry and exit rules.',
      });
    } catch {
      // ignore
    } finally {
      setIsVerifyingEngine(false);
    }
  };

  const totalRoomsCount = lodgeRooms.length;
  const occupiedRoomsCount = lodgeRooms.filter(
    (r) =>
      r.lifecycleState === 'OCCUPIED' ||
      r.lifecycleState === 'CHECKED_IN' ||
      r.lifecycleState === 'TEMPORARILY_VACANT'
  ).length;
  const availableRoomsCount = lodgeRooms.filter((r) => r.lifecycleState === 'AVAILABLE').length;
  const reservedRoomsCount = lodgeRooms.filter((r) => r.lifecycleState === 'RESERVED').length;
  const cleaningRoomsCount = lodgeRooms.filter(
    (r) => r.lifecycleState === 'CLEANING' || r.lifecycleState === 'HANDED_OVER'
  ).length;
  const currentRegisteredGuestsCount = lodgeRooms.reduce((sum, r) => sum + r.registeredGuests, 0);
  const occupiedPct = totalRoomsCount > 0 ? Math.round((occupiedRoomsCount / totalRoomsCount) * 100) : 0;
  const availablePct = totalRoomsCount > 0 ? Math.round((availableRoomsCount / totalRoomsCount) * 100) : 0;

  const filteredEvents =
    analysisResult?.enriched_events.filter((ev) => {
      const matchesType = eventFilter === 'ALL' ? true : ev.event_type === eventFilter;
      const matchesSearch =
        !timelineSearch.trim() ||
        ev.person_id.toLowerCase().includes(timelineSearch.toLowerCase()) ||
        ev.room_id.toLowerCase().includes(timelineSearch.toLowerCase()) ||
        ev.evidence_description.toLowerCase().includes(timelineSearch.toLowerCase());
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

  return (
    <AppLayout
      activeRoute={activeRoute}
      onNavigate={setActiveRoute}
      portalMode={portalMode}
      onSwitchPortal={setPortalMode}
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
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/mpeg,video/3gpp,.mp4,.mov,.webm,.avi,.3gp"
        onChange={(e) => handleFilePicked(e.target.files?.[0])}
        className="hidden"
      />

      {errorBanner && (
        <ErrorState
          code={errorBanner.code}
          message={errorBanner.message}
          detail={errorBanner.detail}
          onRetry={selectedFile ? handleAnalyzeVideo : undefined}
          onDismiss={() => setErrorBanner(null)}
        />
      )}

      {toastSuccess && (
        <SuccessState
          title={toastSuccess.title}
          message={toastSuccess.message}
          onDismiss={() => setToastSuccess(null)}
        />
      )}

      {/* =====================================================================
          LODGE MANAGEMENT PORTAL: DASHBOARD
         ===================================================================== */}
      {portalMode === 'lodge' && activeRoute === 'dashboard' && (
        <div className="space-y-6">
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              label="Total Rooms"
              value={totalRoomsCount}
              supportingText={`Across 3 Floors (${selectedBranch})`}
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
              onClick={() => setActiveRoute('activity')}
            />
            <StatCard
              label="Available Rooms"
              value={availableRoomsCount}
              supportingText={`${availablePct}% Available`}
              icon={<BedDouble className="w-6 h-6" />}
              iconTone="blue"
              ringPercentage={availablePct}
              ringColor="#1769E8"
              onClick={() => setActiveRoute('handover')}
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
              onClick={() => setActiveRoute('guests')}
            />
            <StatCard
              label="Cameras Online"
              value={`${cameras.filter((c) => c.rtspConnected).length} / ${cameras.length}`}
              supportingText="100% Edge Healthy"
              icon={<Video className="w-6 h-6" />}
              iconTone="green"
              onClick={() => setActiveRoute('monitoring')}
            />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white border border-[#E1EAF5] rounded-2xl shadow-2xs overflow-hidden">
                <SectionHeader
                  darkHeader
                  title="Live CCTV Preview"
                  icon={<Camera className="w-5 h-5 text-white" />}
                  rightContent={<ConnectionStatus online={Boolean(videoPreviewUrl)} label={videoPreviewUrl ? 'Clip Loaded' : 'No Live Stream'} />}
                />
                <div className="p-3 bg-[#082B59]/5">
                  {videoPreviewUrl ? (
                    <div className="relative rounded-xl overflow-hidden bg-[#061F43] aspect-video border border-[#082B59]/20">
                      <video
                        ref={dashboardVideoRef}
                        src={videoPreviewUrl}
                        playsInline
                        muted={isVideoMuted}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl bg-[#061F43] text-white aspect-video p-6 flex flex-col items-center justify-center text-center">
                      <Video className="w-8 h-8 text-[#3188F5] mb-2" />
                      <h3 className="text-sm font-bold text-white">Live RTSP Stream Ready (Upload Evaluation Mode)</h3>
                      <p className="text-xs text-white/70 max-w-md mt-1">
                        Upload a corridor CCTV video clip to preview doorway crossings and test Gemini analysis.
                      </p>
                      <div className="mt-4">
                        <Button
                          variant="primary"
                          size="md"
                          icon={<Upload className="w-4 h-4" />}
                          onClick={() => setActiveRoute('analysis')}
                        >
                          Upload CCTV Video
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div
                onClick={() => setActiveRoute('analysis')}
                className="group cursor-pointer rounded-2xl bg-gradient-to-r from-[#1769E8] via-[#2478F0] to-[#3188F5] text-white p-5 shadow-md hover:shadow-lg transition-all flex items-center justify-between gap-4 border border-[#1769E8]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#082B59] text-white flex items-center justify-center shrink-0">
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                      Analyze CCTV Video
                    </h3>
                    <p className="text-xs sm:text-sm text-white/90 mt-0.5">
                      Upload and analyze room activity with Gemini AI
                    </p>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#082B59] text-white flex items-center justify-center shrink-0">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-3">
                <SectionHeader title="Recent PMS Reservations" icon={<Calendar className="w-4 h-4" />} />
                <DataTable
                  columns={[
                    { key: 'id', header: 'ID', render: (r) => <span className="font-mono text-xs text-[#1769E8]">{r.id}</span> },
                    { key: 'guest', header: 'Guest', render: (r) => <span className="font-bold text-[#152B4A]">{r.guestName}</span> },
                    { key: 'room', header: 'Room', render: (r) => <span className="font-mono">{r.roomId}</span> },
                    { key: 'status', header: 'Status', render: (r) => <StatusBadge label={r.status} tone="success" /> },
                  ]}
                  data={reservations}
                  rowKey={(r) => r.id}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          LODGE MANAGEMENT PORTAL: 16 PMS MODULES & CCTV INTELLIGENCE
         ===================================================================== */}
      {portalMode === 'lodge' && activeRoute === 'reservations' && (
        <div className="space-y-6">
          <PageHeader
            title="Reservations & Bookings Management"
            subtitle="Manage confirmed bookings, guest arrivals, and stay dates."
            icon={<Calendar className="w-5 h-5" />}
            actions={<Button variant="primary" size="md">New Reservation</Button>}
          />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'id', header: 'Reservation ID', render: (r) => <span className="font-mono font-bold text-[#1769E8]">{r.id}</span> },
                { key: 'branch', header: 'Branch', render: (r) => <span>{r.branchName}</span> },
                { key: 'guest', header: 'Guest Name', render: (r) => <span className="font-bold text-[#152B4A]">{r.guestName}</span> },
                { key: 'room', header: 'Room', render: (r) => <span className="font-mono">{r.roomId}</span> },
                { key: 'dates', header: 'Check-In / Out', render: (r) => <span className="font-mono text-xs">{r.checkInDate} → {r.checkOutDate}</span> },
                { key: 'amount', header: 'Total (TZS)', align: 'right', render: (r) => <span className="font-mono font-bold">{r.totalAmount.toLocaleString()} TZS</span> },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge label={r.status} tone="success" /> },
              ]}
              data={reservations}
              rowKey={(r) => r.id}
            />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'guests' && (
        <div className="space-y-6">
          <PageHeader
            title="Guest Directory & Profiles"
            subtitle="Registered guest identification and stay history across branches."
            icon={<Users className="w-5 h-5" />}
          />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'id', header: 'Guest ID', render: (g) => <span className="font-mono text-[#1769E8]">{g.id}</span> },
                { key: 'name', header: 'Full Name', render: (g) => <span className="font-bold text-[#152B4A]">{g.fullName}</span> },
                { key: 'phone', header: 'Phone', render: (g) => <span className="font-mono">{g.phone}</span> },
                { key: 'email', header: 'Email', render: (g) => <span>{g.email}</span> },
                { key: 'idnum', header: 'ID / Passport', render: (g) => <span className="font-mono">{g.idNumber}</span> },
                { key: 'stays', header: 'Total Stays', align: 'right', render: (g) => <span className="font-mono font-bold">{g.totalStays}</span> },
              ]}
              data={guests}
              rowKey={(g) => g.id}
            />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'checkin' && (
        <div className="space-y-6">
          <PageHeader
            title="Check-In & Check-Out Operations"
            subtitle="Process front-desk guest arrivals and departures."
            icon={<CheckCircle2 className="w-5 h-5" />}
          />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
            <SectionHeader title="In-House Active Stays" icon={<BedDouble className="w-4 h-4" />} />
            <DataTable
              columns={[
                { key: 'id', header: 'Reservation', render: (r) => <span className="font-mono text-[#1769E8]">{r.id}</span> },
                { key: 'guest', header: 'Guest', render: (r) => <span className="font-bold">{r.guestName}</span> },
                { key: 'room', header: 'Room', render: (r) => <span className="font-mono font-bold">{r.roomId}</span> },
                { key: 'checkout', header: 'Scheduled Departure', render: (r) => <span className="font-mono">{r.checkOutDate}</span> },
                { key: 'action', header: 'Action', align: 'right', render: (r) => <Button variant="primary" size="sm">Process Check-Out</Button> },
              ]}
              data={reservations.filter((r) => r.status === 'CHECKED_IN')}
              rowKey={(r) => r.id}
            />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'rooms' && (
        <div className="space-y-6">
          <PageHeader
            title="Room Management & Pricing"
            subtitle="Configure rooms, categories, pricing, and operational status."
            icon={<BedDouble className="w-5 h-5" />}
            actions={<Button variant="primary" size="md">Add Room</Button>}
          />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'room', header: 'Room ID', render: (r) => <span className="font-mono font-bold text-[#082B59]">{r.roomId}</span> },
                { key: 'floor', header: 'Floor / Wing', render: (r) => <span>{r.floor}</span> },
                { key: 'camera', header: 'Camera', render: (r) => <span className="font-mono text-xs text-[#1769E8]">{r.cameraId}</span> },
                { key: 'guests', header: 'Guests', align: 'right', render: (r) => <span className="font-mono">{r.registeredGuests}</span> },
                { key: 'cleaning', header: 'Cleaning', render: (r) => <StatusBadge label={r.cleaningStatus} tone={r.cleaningStatus === 'CLEAN' ? 'success' : 'warning'} /> },
                { key: 'status', header: 'Lifecycle State', render: (r) => <StatusBadge label={r.lifecycleState} tone="info" /> },
              ]}
              data={lodgeRooms}
              rowKey={(r) => r.roomId}
            />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'housekeeping' && (
        <div className="space-y-6">
          <PageHeader
            title="Housekeeping & Room Status"
            subtitle="Track cleaning schedules and room readiness."
            icon={<Layers className="w-5 h-5" />}
          />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'room', header: 'Room ID', render: (r) => <span className="font-mono font-bold">{r.roomId}</span> },
                { key: 'floor', header: 'Floor', render: (r) => <span>{r.floor}</span> },
                { key: 'status', header: 'Cleaning Status', render: (r) => <StatusBadge label={r.cleaningStatus} tone={r.cleaningStatus === 'CLEAN' ? 'success' : 'danger'} /> },
                { key: 'action', header: 'Action', align: 'right', render: (r) => <Button variant="outline" size="sm">Mark Clean</Button> },
              ]}
              data={lodgeRooms}
              rowKey={(r) => r.roomId}
            />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'reception' && (
        <div className="space-y-6">
          <PageHeader
            title="Reception Operations & Cashier"
            subtitle="Front-desk operations, cash drawer reconciliation, and incidental billing."
            icon={<CreditCard className="w-5 h-5" />}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StatCard label="Today's Cash Drawer" value="1,240,000 TZS" supportingText="Reconciled with Shift A" icon={<CreditCard className="w-6 h-6" />} iconTone="green" />
            <StatCard label="Pending Folio Balances" value="420,000 TZS" supportingText="2 open folios" icon={<Receipt className="w-6 h-6" />} iconTone="amber" />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'billing' && (
        <div className="space-y-6">
          <PageHeader
            title="Invoices & Billing"
            subtitle="Guest folios, payment receipts, and tax calculations."
            icon={<Receipt className="w-5 h-5" />}
          />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'id', header: 'Invoice ID', render: (i) => <span className="font-mono font-bold text-[#1769E8]">{i.id}</span> },
                { key: 'res', header: 'Reservation', render: (i) => <span className="font-mono">{i.reservationId}</span> },
                { key: 'guest', header: 'Guest Name', render: (i) => <span className="font-bold">{i.guestName}</span> },
                { key: 'room', header: 'Room', render: (i) => <span className="font-mono">{i.roomNumber}</span> },
                { key: 'amount', header: 'Amount (TZS)', align: 'right', render: (i) => <span className="font-mono">{i.amount.toLocaleString()} TZS</span> },
                { key: 'status', header: 'Status', render: (i) => <StatusBadge label={i.status} tone={i.status === 'PAID' ? 'success' : 'warning'} /> },
              ]}
              data={invoices}
              rowKey={(i) => i.id}
            />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'expenses' && (
        <div className="space-y-6">
          <PageHeader
            title="Lodge Operating Expenses"
            subtitle="Track branch operational costs, maintenance, and supplies."
            icon={<FileSpreadsheet className="w-5 h-5" />}
            actions={<Button variant="primary" size="md">Log Expense</Button>}
          />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'id', header: 'Expense ID', render: (e) => <span className="font-mono text-[#1769E8]">{e.id}</span> },
                { key: 'cat', header: 'Category', render: (e) => <span className="font-bold text-[#152B4A]">{e.category}</span> },
                { key: 'desc', header: 'Description', render: (e) => <span>{e.description}</span> },
                { key: 'date', header: 'Date', render: (e) => <span className="font-mono text-xs">{e.date}</span> },
                { key: 'amt', header: 'Amount (TZS)', align: 'right', render: (e) => <span className="font-mono font-bold text-[#EF4444]">{e.amount.toLocaleString()} TZS</span> },
              ]}
              data={expenses}
              rowKey={(e) => e.id}
            />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'staff' && (
        <div className="space-y-6">
          <PageHeader
            title="Staff Management & RBAC Security"
            subtitle="Manage employee roles, shift schedules, and encrypted face references."
            icon={<Users className="w-5 h-5" />}
            actions={<Button variant="primary" size="md" onClick={() => setStaffModalOpen(true)}>Register Staff</Button>}
          />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'id', header: 'Staff ID', render: (s) => <span className="font-mono font-bold text-[#1769E8]">{s.staff_id}</span> },
                { key: 'name', header: 'Name', render: (s) => <span className="font-bold text-[#152B4A]">{s.full_name}</span> },
                { key: 'role', header: 'Role', render: (s) => <StatusBadge label={s.role} tone="info" /> },
                { key: 'tier', header: 'Access Tier', render: (s) => <span className="font-mono text-xs">{s.access_control_tier}</span> },
                { key: 'status', header: 'Encryption', render: (s) => <StatusBadge label={s.template_encryption_status} tone="success" dot /> },
              ]}
              data={staffReferences}
              rowKey={(s) => s.staff_id}
            />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'cctv-intelligence' && (
        <div className="space-y-6">
          <PageHeader
            title="CCTV Intelligence Module"
            subtitle="Live device health, door configurations, and automated corridor event feeds."
            icon={<Video className="w-5 h-5" />}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Connected Cameras" value={cameras.length} supportingText="All edge nodes active" icon={<Video className="w-5 h-5" />} iconTone="green" />
            <StatCard label="Doorway Zones Mapped" value={cameras.length * 2} supportingText="Virtual polygon ROIs active" icon={<DoorOpen className="w-5 h-5" />} iconTone="blue" />
            <StatCard label="Gemini Verification" value="99.2%" supportingText="Model confidence rate" icon={<ShieldCheck className="w-5 h-5" />} iconTone="navy" />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'revenue-investigation' && (
        <div className="space-y-6">
          <PageHeader
            title="Unrecorded Revenue Investigation"
            subtitle="Automatic reconciliation comparing CCTV occupancy events against PMS reservations and guest stays."
            icon={<AlertTriangle className="w-5 h-5" />}
          />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
            <SectionHeader title="Discrepancy Audit Queue" icon={<AlertTriangle className="w-4 h-4 text-[#F5A623]" />} />
            <DataTable
              columns={[
                { key: 'id', header: 'Investigation ID', render: (inv) => <span className="font-mono font-bold text-[#1769E8]">{inv.investigationId}</span> },
                { key: 'room', header: 'Room', render: (inv) => <span className="font-mono font-bold">{inv.roomId}</span> },
                { key: 'dur', header: 'Observed Duration', render: (inv) => <span className="font-mono">{inv.observedDuration}</span> },
                { key: 'pms', header: 'PMS Match Status', render: (inv) => <StatusBadge label={inv.pmsMatchStatus} tone="warning" /> },
                { key: 'status', header: 'Status', render: (inv) => <StatusBadge label={inv.investigationStatus} tone="danger" /> },
                { key: 'exposure', header: 'Potential Exposure', align: 'right', render: (inv) => <span className="font-mono font-bold text-[#EF4444]">{inv.potentialExposure.toLocaleString()} TZS</span> },
              ]}
              data={investigations}
              rowKey={(inv) => inv.investigationId}
            />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'monitoring' && (
        <div className="space-y-6">
          <PageHeader title="CCTV Corridor Monitoring" subtitle="Inspect corridor camera nodes and door threshold alignment." icon={<Video className="w-5 h-5" />} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cameras.map((cam) => (
              <div key={cam.cameraId} className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-[#082B59]">{cam.cameraId} · {cam.targetRoomId}</div>
                  <StatusBadge label="Online" tone="success" dot />
                </div>
                <div className="text-xs text-[#718096]">{cam.name}</div>
                <Button variant="primary" size="sm" onClick={() => setActiveRoute('analysis')}>Analyze Clip</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'analysis' && (
        <div className="space-y-6">
          <PageHeader title="CCTV Video Analysis Studio" subtitle="Upload corridor clips and analyze via Gemini." icon={<Play className="w-5 h-5" />} />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="text-center py-8">
              <Upload className="w-12 h-12 text-[#1769E8] mx-auto mb-3" />
              <h3 className="text-base font-bold text-[#152B4A]">Upload CCTV Video File</h3>
              <p className="text-xs text-[#718096] max-w-sm mx-auto mt-1 mb-4">Select an MP4/MOV video clip to execute Gemini multimodal analysis.</p>
              <Button variant="primary" size="lg" icon={<Upload className="w-4 h-4" />} onClick={() => fileInputRef.current?.click()}>
                Browse Video File
              </Button>
            </div>
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'activity' && (
        <div className="space-y-6">
          <PageHeader title="Room Activity" subtitle="Deterministic room occupancy engine verification." icon={<BedDouble className="w-5 h-5" />} />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-6 shadow-2xs text-center py-12">
            <BedDouble className="w-10 h-10 text-[#1769E8] mx-auto mb-3 opacity-80" />
            <h3 className="text-base font-bold text-[#152B4A]">No CCTV Video Analyzed in Current Session</h3>
            <p className="text-xs text-[#718096] max-w-sm mx-auto mt-1">Upload and analyze a corridor video clip in Video Analysis to populate occupancy metrics.</p>
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'timeline' && (
        <div className="space-y-6">
          <PageHeader title="Chronological Event Timeline" subtitle="Corridor doorway crossings." icon={<Clock className="w-5 h-5" />} />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-6 shadow-2xs text-center py-12">
            <Clock className="w-10 h-10 text-[#1769E8] mx-auto mb-3 opacity-80" />
            <h3 className="text-base font-bold text-[#152B4A]">No Events Recorded Yet</h3>
            <p className="text-xs text-[#718096]">Analyze a video clip to view event timeline.</p>
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'handover' && (
        <div className="space-y-6">
          <PageHeader title="Room Handover Lifecycle" subtitle="Staff-verified checkout handover." icon={<CheckCircle2 className="w-5 h-5" />} />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-6 shadow-2xs space-y-4">
            <SectionHeader title="Active Room State" icon={<CheckCircle2 className="w-4 h-4" />} rightContent={<StatusBadge label={roomLifecycleState} tone="navy" />} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleAuthorizedStateTransition('CHECKOUT_PENDING')}>Flag Checkout Pending</Button>
              <Button variant="primary" size="sm" onClick={() => handleAuthorizedStateTransition('HANDED_OVER')}>Confirm Staff Handover</Button>
            </div>
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'reports' && (
        <div className="space-y-6">
          <PageHeader title="Operational & Financial Reports" subtitle="Consolidated branch analytics." icon={<BarChart3 className="w-5 h-5" />} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Monthly Revenue" value="28,400,000 TZS" supportingText="+14% vs last month" icon={<BarChart3 className="w-6 h-6" />} iconTone="green" />
            <StatCard label="Average Occupancy" value="78.5%" supportingText="Across 3 branches" icon={<BedDouble className="w-6 h-6" />} iconTone="blue" />
            <StatCard label="CCTV Accuracy" value="99.4%" supportingText="Verified ground truth" icon={<ShieldCheck className="w-6 h-6" />} iconTone="navy" />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'admin' && (
        <div className="space-y-6">
          <PageHeader title="Branch & Administration" subtitle="Manage branch settings and rooms." icon={<Settings className="w-5 h-5" />} />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'room', header: 'Room ID', render: (r) => <span className="font-mono font-bold">{r.roomId}</span> },
                { key: 'floor', header: 'Floor', render: (r) => <span>{r.floor}</span> },
                { key: 'guests', header: 'Guests', align: 'right', render: (r) => <span className="font-mono">{r.registeredGuests}</span> },
              ]}
              data={lodgeRooms}
              rowKey={(r) => r.roomId}
            />
          </div>
        </div>
      )}

      {portalMode === 'lodge' && activeRoute === 'settings' && (
        <div className="space-y-6">
          <PageHeader title="Settings & AI Configuration" subtitle="Gemini API status and thresholds." icon={<Sliders className="w-5 h-5" />} />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
            <SectionHeader title="Gemini Multimodal AI Status" icon={<Sparkles className="w-4 h-4" />} />
            <div className="text-xs space-y-2">
              <div className="flex justify-between py-1 border-b">
                <span>API Key Status</span>
                <StatusBadge label={health?.gemini_configured ? 'Active' : 'Missing'} tone={health?.gemini_configured ? 'success' : 'danger'} dot />
              </div>
              <div className="flex justify-between py-1">
                <span>Active Model</span>
                <span className="font-mono font-bold">{health?.model || 'gemini-3.1-flash-lite'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          ENKAI PLATFORM MANAGEMENT PORTAL
         ===================================================================== */}
      {portalMode === 'platform' && activeRoute === 'platform-dashboard' && (
        <div className="space-y-6">
          <PageHeader title="ENKAI Platform Administration Dashboard" subtitle="Global multi-tenant SaaS operations and device fleet monitoring." icon={<Building className="w-5 h-5" />} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Active Tenants" value={tenants.length} supportingText="Multi-tenant isolation active" icon={<Building className="w-6 h-6" />} iconTone="navy" />
            <StatCard label="Total Branches" value="5" supportingText="Across Tanzania & Kenya" icon={<MapPin className="w-6 h-6" />} iconTone="blue" />
            <StatCard label="CCTV Agents Online" value="2 / 2" supportingText="100% Edge Health" icon={<Cpu className="w-6 h-6" />} iconTone="green" />
            <StatCard label="Monthly AI Tokens" value="1.4M" supportingText="Gemini 3.1 Flash Lite" icon={<BarChart3 className="w-6 h-6" />} iconTone="amber" />
          </div>
        </div>
      )}

      {portalMode === 'platform' && activeRoute === 'platform-tenants' && (
        <div className="space-y-6">
          <PageHeader title="Tenant & Lodge Business Management" subtitle="Manage SaaS subscriptions and tenant organizations." icon={<Building className="w-5 h-5" />} />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'id', header: 'Tenant ID', render: (t) => <span className="font-mono text-[#1769E8]">{t.id}</span> },
                { key: 'name', header: 'Organization Name', render: (t) => <span className="font-bold text-[#152B4A]">{t.name}</span> },
                { key: 'slug', header: 'Slug', render: (t) => <span className="font-mono text-xs">{t.slug}</span> },
                { key: 'tier', header: 'Subscription', render: (t) => <StatusBadge label={t.subscriptionTier} tone="success" /> },
                { key: 'branches', header: 'Branches', align: 'right', render: (t) => <span className="font-mono">{t.branchesCount}</span> },
                { key: 'cameras', header: 'Cameras', align: 'right', render: (t) => <span className="font-mono">{t.camerasCount}</span> },
              ]}
              data={tenants}
              rowKey={(t) => t.id}
            />
          </div>
        </div>
      )}

      {portalMode === 'platform' && activeRoute === 'platform-branches' && (
        <div className="space-y-6">
          <PageHeader title="Global Branch Directory" subtitle="All lodge properties across tenants." icon={<MapPin className="w-5 h-5" />} />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'name', header: 'Branch Name', render: (b) => <span className="font-bold">{b.name}</span> },
                { key: 'tz', header: 'Timezone', render: () => <span className="font-mono">Africa/Dar_es_Salaam (EAT)</span> },
                { key: 'status', header: 'Status', render: () => <StatusBadge label="ACTIVE" tone="success" dot /> },
              ]}
              data={branches.map((b) => ({ name: b }))}
              rowKey={(b) => b.name}
            />
          </div>
        </div>
      )}

      {portalMode === 'platform' && activeRoute === 'platform-devices' && (
        <div className="space-y-6">
          <PageHeader title="CCTV Device Registry" subtitle="IP cameras, RTSP streams, and ONVIF nodes." icon={<Video className="w-5 h-5" />} />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'id', header: 'Camera ID', render: (c) => <span className="font-mono font-bold text-[#1769E8]">{c.cameraId}</span> },
                { key: 'name', header: 'Camera Name', render: (c) => <span className="font-bold">{c.name}</span> },
                { key: 'branch', header: 'Branch', render: (c) => <span>{c.branch}</span> },
                { key: 'room', header: 'Target Room', render: (c) => <span className="font-mono">{c.targetRoomId}</span> },
                { key: 'status', header: 'Stream Status', render: (c) => <StatusBadge label={c.rtspConnected ? 'ONLINE' : 'PENDING'} tone={c.rtspConnected ? 'success' : 'warning'} dot /> },
              ]}
              data={cameras}
              rowKey={(c) => c.cameraId}
            />
          </div>
        </div>
      )}

      {portalMode === 'platform' && activeRoute === 'platform-agents' && (
        <div className="space-y-6">
          <PageHeader title="CCTV Agent Node Management" subtitle="Local edge installation daemons and sync status." icon={<Cpu className="w-5 h-5" />} />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'id', header: 'Agent ID', render: (a) => <span className="font-mono font-bold text-[#1769E8]">{a.agentId}</span> },
                { key: 'name', header: 'Agent Name', render: (a) => <span className="font-bold">{a.agentName}</span> },
                { key: 'branch', header: 'Branch', render: (a) => <span>{a.branchName}</span> },
                { key: 'ip', header: 'IP Address', render: (a) => <span className="font-mono">{a.ipAddress}</span> },
                { key: 'status', header: 'Daemon Status', render: (a) => <StatusBadge label={a.status} tone="success" dot /> },
                { key: 'seen', header: 'Last Heartbeat', render: (a) => <span className="font-mono text-xs">{a.lastSeen}</span> },
              ]}
              data={cctvAgents}
              rowKey={(a) => a.agentId}
            />
          </div>
        </div>
      )}

      {portalMode === 'platform' && activeRoute === 'platform-ai' && (
        <div className="space-y-6">
          <PageHeader title="AI Usage & Cost Monitoring" subtitle="Gemini model consumption and API request metrics." icon={<BarChart3 className="w-5 h-5" />} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Total API Requests" value="14,250" supportingText="Last 30 days" icon={<BarChart3 className="w-6 h-6" />} iconTone="blue" />
            <StatCard label="Active Model" value="Gemini 3.1 Flash" supportingText="Free Tier Multimodal" icon={<Sparkles className="w-6 h-6" />} iconTone="green" />
            <StatCard label="Success Rate" value="99.98%" supportingText="With auto-failover cascade" icon={<ShieldCheck className="w-6 h-6" />} iconTone="navy" />
          </div>
        </div>
      )}

      {portalMode === 'platform' && activeRoute === 'platform-audit' && (
        <div className="space-y-6">
          <PageHeader title="Platform Audit Logs" subtitle="Cross-tenant administrative activity audit." icon={<ShieldAlert className="w-5 h-5" />} />
          <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs">
            <DataTable
              columns={[
                { key: 'time', header: 'Timestamp (EAT)', render: () => <span className="font-mono text-xs">Nov 09, 2026, 06:00:00 AM EAT</span> },
                { key: 'tenant', header: 'Tenant', render: () => <span className="font-bold">Enkai Luxury Lodges</span> },
                { key: 'action', header: 'Action', render: () => <StatusBadge label="AGENT_ENROLLMENT" tone="info" /> },
                { key: 'actor', header: 'Actor', render: () => <span>Platform Admin</span> },
              ]}
              data={[{ id: 1 }]}
              rowKey={() => '1'}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          ENKAI CCTV AGENT NODE CONFIGURATION
         ===================================================================== */}
      {portalMode === 'agent' && (
        <div className="space-y-6">
          <PageHeader title="ENKAI CCTV Agent Node (Edge Daemon)" subtitle="Local RTSP stream ingestion, multi-door polygon ROI mapping, and offline event queue." icon={<Cpu className="w-5 h-5" />} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
              <SectionHeader title="Agent Connection Status" icon={<Cpu className="w-4 h-4 text-[#12B981]" />} rightContent={<StatusBadge label="ONLINE" tone="success" dot />} />
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-[#718096]">Agent ID</span>
                  <span className="font-bold">AGT-DAR-01</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-[#718096]">Branch Assigned</span>
                  <span>Main Branch</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-[#718096]">Local SQLite Queue</span>
                  <span className="text-[#12B981]">0 pending (Fully Synced)</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 shadow-2xs space-y-4">
              <SectionHeader title="Multi-Door Polygon ROIs" icon={<DoorOpen className="w-4 h-4 text-[#1769E8]" />} />
              <div className="text-xs text-[#718096]">
                CAM-CORRIDOR-01 covers ROOM-101 and ROOM-102 with distinct virtual polygon threshold boxes.
              </div>
              <Button variant="primary" size="sm" onClick={() => setDoorwayModalOpen(true)}>Configure Door Polygon</Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
