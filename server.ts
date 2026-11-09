import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  computeDeterministicOccupancy,
  deriveNextRoomStateFromCctv,
  formatDarEsSalaamTime,
  validateAndNormalizeGeminiOutput,
} from './src/engine/occupancyEngine';
import { DoorwayConfig, FullAnalysisResult } from './src/types/lodgeflow';
import { isDatabaseConfigured } from './server/db/pool';
import { createRoomsRouter } from './server/routes/rooms';
import { createRoomCategoriesRouter } from './server/routes/roomCategories';
import { createRoomImportRouter } from './server/routes/roomImport';

const PORT = 3000;
const GEMINI_FREE_TIER_MODEL = 'gemini-3.1-flash-lite';
const FREE_TIER_MODEL_CASCADE = [
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.8-flash',
] as const;
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

const SUPPORTED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/avi',
  'video/mpeg',
  'video/3gpp',
  'video/x-matroska',
]);

const uploadDir = path.join(os.tmpdir(), 'enkai-lodgeflow-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Track chunked upload sessions
interface UploadSession {
  uploadId: string;
  filename: string;
  mimeType: string;
  totalSize: number;
  receivedBytes: number;
  filePath: string;
  createdAt: number;
}

// Track background analysis jobs to prevent HTTP proxy timeouts
interface AnalysisJob {
  jobId: string;
  status: 'QUEUED' | 'UPLOADING_TO_GEMINI' | 'GEMINI_PROCESSING_VIDEO' | 'RUNNING_VISION_MODEL' | 'COMPUTING_OCCUPANCY' | 'COMPLETED' | 'FAILED';
  stageMessage: string;
  startedAt: number;
  updatedAt: number;
  result?: FullAnalysisResult;
  error?: {
    error_code: string;
    message: string;
    technical_detail?: string;
  };
}

const uploadSessions = new Map<string, UploadSession>();
const analysisJobs = new Map<string, AnalysisJob>();

// Clean up stale jobs/sessions older than 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of uploadSessions.entries()) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      try {
        if (fs.existsSync(session.filePath)) fs.unlinkSync(session.filePath);
      } catch {}
      uploadSessions.delete(id);
    }
  }
  for (const [id, job] of analysisJobs.entries()) {
    if (now - job.startedAt > 30 * 60 * 1000) {
      analysisJobs.delete(id);
    }
  }
}, 5 * 60 * 1000);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_VIDEO_SIZE_BYTES,
  },
});

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Please verify your API key in the Google AI Studio Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function resolveMimeTypeByNameAndType(filename: string, rawMimeInput: string): string {
  const rawMime = (rawMimeInput || '').split(';')[0].trim().toLowerCase();
  if (SUPPORTED_VIDEO_MIMES.has(rawMime)) {
    return rawMime === 'video/avi' ? 'video/x-msvideo' : rawMime;
  }
  const ext = path.extname(filename).toLowerCase();
  const extMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg',
    '.3gp': 'video/3gpp',
    '.mkv': 'video/x-matroska',
  };
  return extMap[ext] || rawMime || 'video/mp4';
}

const GEMINI_ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    room_id: {
      type: Type.STRING,
      description: 'The room identifier analyzed, e.g. ROOM-101.',
    },
    video_duration_seconds: {
      type: Type.INTEGER,
      description: 'Observed video duration in seconds.',
    },
    detected_osd_real_timestamp: {
      type: Type.STRING,
      nullable: true,
      description:
        'ISO 8601 date-time string ONLY if a full real-world date and clock time overlay is visibly burned into the CCTV footage. Otherwise null.',
    },
    analysis_summary: {
      type: Type.STRING,
      description:
        'Detailed, factual summary of all observed corridor movements, doorway entries, doorway exits, re-entries, and occupancy changes.',
    },
    camera_angle_assessment: {
      type: Type.STRING,
      description:
        'Assessment of the camera perspective, doorway visibility, and threshold line clarity.',
    },
    video_quality_assessment: {
      type: Type.STRING,
      description:
        'Assessment of video resolution, lighting, frame rate, and any occlusion or motion blur.',
    },
    events: {
      type: Type.ARRAY,
      description:
        'Chronological list of all person movement events observed in the video.',
      items: {
        type: Type.OBJECT,
        properties: {
          event_id: {
            type: Type.STRING,
            description: 'Sequential identifier such as EVT-001, EVT-002.',
          },
          person_id: {
            type: Type.STRING,
            description:
              'Temporary anonymous tracking identifier such as PERSON-A, PERSON-B, PERSON-C, or PERSON-UNCERTAIN.',
          },
          event_type: {
            type: Type.STRING,
            description:
              'Must be one of: ENTRY, EXIT, RE_ENTRY, CORRIDOR_PASS, UNKNOWN.',
          },
          video_timestamp: {
            type: Type.STRING,
            description:
              'Video-relative timestamp in HH:MM:SS format (e.g. 00:00:02, 00:00:15).',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Confidence score between 0.0 and 1.0.',
          },
          verification_status: {
            type: Type.STRING,
            description: 'Must be one of: CONFIRMED, UNVERIFIED, UNCERTAIN.',
          },
          direction_established: {
            type: Type.BOOLEAN,
            description:
              'True if the camera angle and visual motion clearly establish the direction of travel.',
          },
          crossed_doorway_threshold: {
            type: Type.BOOLEAN,
            description:
              'True ONLY if there is clear visual evidence that the person physically crossed the target room doorway threshold.',
          },
          appearance_descriptor: {
            type: Type.STRING,
            description:
              'Anonymous visual clothing/attire descriptor for tracking across the clip (no facial recognition or personal identity).',
          },
          evidence_description: {
            type: Type.STRING,
            description:
              'Specific visual evidence explaining why this event was classified as ENTRY, EXIT, RE_ENTRY, CORRIDOR_PASS, or UNKNOWN.',
          },
        },
        required: [
          'event_id',
          'person_id',
          'event_type',
          'video_timestamp',
          'confidence',
          'verification_status',
          'direction_established',
          'crossed_doorway_threshold',
          'evidence_description',
        ],
      },
    },
    occupancy: {
      type: Type.OBJECT,
      properties: {
        current_count: {
          type: Type.INTEGER,
          description: 'Number of people inside the room at the end of the video.',
        },
        peak_count: {
          type: Type.INTEGER,
          description: 'Maximum number of people simultaneously inside the room during the video.',
        },
        total_entries: {
          type: Type.INTEGER,
          description: 'Total count of confirmed doorway entries (including re-entries).',
        },
        total_exits: {
          type: Type.INTEGER,
          description: 'Total count of confirmed doorway exits.',
        },
      },
      required: ['current_count', 'peak_count', 'total_entries', 'total_exits'],
    },
    unverified_events: {
      type: Type.ARRAY,
      description:
        'List of any ambiguous, occluded, or unverified movements where doorway crossing or person identity could not be confirmed.',
      items: {
        type: Type.OBJECT,
        properties: {
          event_id: { type: Type.STRING },
          person_id: { type: Type.STRING },
          video_timestamp: { type: Type.STRING },
          reason_unverified: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          evidence_description: { type: Type.STRING },
        },
        required: [
          'event_id',
          'person_id',
          'video_timestamp',
          'reason_unverified',
          'confidence',
          'evidence_description',
        ],
      },
    },
    analysis_limitations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Any camera angle limitations, lighting issues, occlusions, or identity re-matching uncertainties observed.',
    },
  },
  required: [
    'room_id',
    'video_duration_seconds',
    'analysis_summary',
    'events',
    'occupancy',
    'unverified_events',
    'analysis_limitations',
  ],
};

function buildCctvAnalysisPrompt(config: DoorwayConfig, clientDuration: number): string {
  return `You are the ENKAI LODGEFLOW AI Computer Vision Engine (Phase 0.3 Accuracy Validation) analyzing a lodge corridor CCTV video clip for Room Entry, Exit, and Occupancy Intelligence.

TARGET ROOM & CAMERA CONFIGURATION:
- Target Room ID: ${config.roomId}
- Camera ID: ${config.cameraId}
- Registered Guest Count for Room: ${config.registeredGuestCount}
- Known Initial Room Occupancy Before Video Start: ${config.initialOccupancyBeforeVideo}
- Camera Perspective: ${config.cameraAngle}
- Target Doorway Position in Frame: ${config.doorwayPosition} (Normalized ROI box: x=${config.thresholdZone.x}%, y=${config.thresholdZone.y}%, width=${config.thresholdZone.width}%, height=${config.thresholdZone.height}%)
- Direction Considered INSIDE the Room: ${config.insideDirection}
- Expected Video Duration: ~${Math.max(1, Math.round(clientDuration || 0))} seconds
${config.customNotes ? `- Operator Scene Notes: ${config.customNotes}` : ''}

STRICT PHASE 0.3 COMPUTER VISION & CLASSIFICATION RULES:
1. Do NOT interpret approaching a doorway as entering. If a person walks toward a doorway and stops or turns away without crossing the threshold, classify as CORRIDOR_PASS or UNKNOWN with crossed_doorway_threshold = false.
2. Do NOT interpret walking past a doorway as entering. If a person walks along the hallway past ${config.roomId} without crossing into the doorway, classify strictly as CORRIDOR_PASS with crossed_doorway_threshold = false.
3. Require visual evidence of physically crossing the doorway threshold:
   - ENTRY: Person visibly crosses the doorway threshold from the corridor INTO ${config.roomId} (crossed_doorway_threshold = true, direction_established = true, verification_status = "CONFIRMED").
   - EXIT: Person visibly crosses the doorway threshold from INSIDE ${config.roomId} out into the corridor (crossed_doorway_threshold = true, direction_established = true, verification_status = "CONFIRMED").
   - RE_ENTRY: A person who previously exited ${config.roomId} in this clip returns and visibly crosses back INTO the doorway of ${config.roomId} (crossed_doorway_threshold = true, direction_established = true, verification_status = "CONFIRMED").
   - UNKNOWN: The doorway threshold or movement direction is obscured, occluded, or ambiguous. Set verification_status = "UNCERTAIN" or "UNVERIFIED", direction_established = false, crossed_doorway_threshold = false, and also record the event in unverified_events.
4. Do NOT invent events that are outside the video timeline (all timestamps must be between 00:00:00 and the actual video duration).
5. Do NOT invent timestamps or confidence values. Report realistic model confidence (0.0 to 1.0) based on visual clarity.
6. Do NOT claim identity continuity when visual evidence is insufficient:
   - Use anonymous tracking IDs: PERSON-A, PERSON-B, PERSON-C.
   - If visual evidence is insufficient to confirm a returning person is the same individual, assign PERSON-UNCERTAIN and note the limitation in analysis_limitations.
7. Preserve video-relative timestamps in HH:MM:SS format (e.g., "00:00:02", "00:00:05") when a full real-world date/time is not burned into the video. Set detected_osd_real_timestamp = null unless a complete real-world calendar date and clock time is visible on screen.
8. Return ONLY valid JSON matching the required responseSchema.`;
}

/**
 * Core Video Analysis Execution Pipeline (Used by both Async Job Runner and Direct Endpoint)
 */
async function executeVideoAnalysisPipeline(params: {
  localFilePath: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  doorwayConfig: DoorwayConfig;
  clientDurationSeconds: number;
  onStageUpdate?: (status: AnalysisJob['status'], stageMessage: string) => void;
}): Promise<FullAnalysisResult> {
  const {
    localFilePath,
    originalFilename,
    mimeType,
    fileSizeBytes,
    doorwayConfig,
    clientDurationSeconds,
    onStageUpdate,
  } = params;

  let geminiRemoteFileName: string | null = null;
  const aiClient = getGeminiClient();

  try {
    let uploadMethod: 'GEMINI_FILES_API' | 'INLINE_BASE64' = 'GEMINI_FILES_API';
    let contentParts: any[] = [];

    // Try Gemini Files API first (standard path for all uploaded videos)
    try {
      onStageUpdate?.(
        'UPLOADING_TO_GEMINI',
        `Uploading ${originalFilename} (${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB) to Gemini Files API...`
      );

      const fileUploadResult = await aiClient.files.upload({
        file: localFilePath,
        config: {
          mimeType,
          displayName: originalFilename,
        },
      });

      if (!fileUploadResult || !fileUploadResult.name) {
        throw new Error('Gemini Files API did not return a file resource name.');
      }

      geminiRemoteFileName = fileUploadResult.name;
      let fileState = fileUploadResult.state;
      let fileUri = fileUploadResult.uri;

      const maxPolls = 60;
      let polls = 0;
      while (fileState === 'PROCESSING' && polls < maxPolls) {
        onStageUpdate?.(
          'GEMINI_PROCESSING_VIDEO',
          `Gemini Files API decoding video stream (${polls * 2}s elapsed)...`
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const check = await aiClient.files.get({ name: geminiRemoteFileName });
        fileState = check.state;
        fileUri = check.uri || fileUri;
        polls += 1;
      }

      if (fileState === 'FAILED') {
        throw new Error(
          'Gemini Files API reported FAILED state while decoding the uploaded video stream.'
        );
      }

      if (fileState !== 'ACTIVE' || !fileUri) {
        throw new Error(
          `Video processing timed out on Gemini Files API (last state: ${fileState}).`
        );
      }

      contentParts = [
        {
          fileData: {
            fileUri,
            mimeType,
          },
        },
        {
          text: buildCctvAnalysisPrompt(doorwayConfig, clientDurationSeconds),
        },
      ];
    } catch (filesApiError) {
      // Fallback to inline base64 if file is <= 18MB and Files API encountered an issue
      if (fileSizeBytes <= 18 * 1024 * 1024) {
        uploadMethod = 'INLINE_BASE64';
        onStageUpdate?.(
          'UPLOADING_TO_GEMINI',
          `Preparing inline multimodal video payload for ${originalFilename}...`
        );
        const fileBuffer = fs.readFileSync(localFilePath);
        const base64Data = fileBuffer.toString('base64');
        contentParts = [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: buildCctvAnalysisPrompt(doorwayConfig, clientDurationSeconds),
          },
        ];
      } else {
        throw filesApiError;
      }
    }

    // Multi-model automatic failover & retry cascade for 503 UNAVAILABLE / 429 spikes
    let response: any = null;
    let modelActuallyUsed: string = GEMINI_FREE_TIER_MODEL;
    let lastModelError: unknown = null;

    // Two passes across the free-tier model cascade if transient 503 high-demand spikes occur
    const candidateModels = [...FREE_TIER_MODEL_CASCADE, ...FREE_TIER_MODEL_CASCADE];

    for (let i = 0; i < candidateModels.length; i++) {
      const candidateModel = candidateModels[i];
      modelActuallyUsed = candidateModel;

      onStageUpdate?.(
        'RUNNING_VISION_MODEL',
        i === 0
          ? `Running ${candidateModel} computer vision doorway & corridor analysis...`
          : `Switching to free-tier fallback model ${candidateModel} (attempt ${i + 1}/${candidateModels.length})...`
      );

      try {
        response = await aiClient.models.generateContent({
          model: candidateModel,
          contents: [{ role: 'user', parts: contentParts }],
          config: {
            systemInstruction:
              'You are a precision hotel security and room occupancy computer vision analyst for ENKAI LODGEFLOW. Never fabricate events. Report only what is visually verifiable in the video timeline.',
            responseMimeType: 'application/json',
            responseSchema: GEMINI_ANALYSIS_RESPONSE_SCHEMA,
          },
        });

        if (response && (response.text ?? '').trim().length > 0) {
          break;
        }
      } catch (modelErr: unknown) {
        lastModelError = modelErr;
        const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
        const lowerMsg = msg.toLowerCase();
        const isTransient =
          lowerMsg.includes('503') ||
          lowerMsg.includes('unavailable') ||
          lowerMsg.includes('high demand') ||
          lowerMsg.includes('overloaded') ||
          lowerMsg.includes('429') ||
          lowerMsg.includes('resource_exhausted') ||
          lowerMsg.includes('500') ||
          lowerMsg.includes('502') ||
          lowerMsg.includes('504') ||
          lowerMsg.includes('fetch failed');

        if (!isTransient || i === candidateModels.length - 1) {
          throw modelErr;
        }

        const backoffMs = i < FREE_TIER_MODEL_CASCADE.length ? 1200 : 3000;
        onStageUpdate?.(
          'RUNNING_VISION_MODEL',
          `${candidateModel} reported temporary high demand (503); failing over to ${
            candidateModels[i + 1]
          }...`
        );
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }

    if (!response && lastModelError) {
      throw lastModelError;
    }

    const rawText = (response?.text ?? '').trim();
    if (!rawText) {
      throw new Error(
        'EMPTY_GEMINI_RESPONSE: Gemini returned an empty analysis response for this video. Please verify the video contains visible frames.'
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      throw new Error(
        `INVALID_GEMINI_JSON: Gemini returned malformed JSON that could not be parsed: ${rawText.slice(0, 200)}`
      );
    }

    onStageUpdate?.(
      'COMPUTING_OCCUPANCY',
      'Validating JSON schema & executing deterministic Room Occupancy Engine...'
    );

    const validatedGemini = validateAndNormalizeGeminiOutput(
      parsedJson,
      doorwayConfig.roomId,
      clientDurationSeconds
    );

    const { deterministicMetrics, enrichedEvents } = computeDeterministicOccupancy(
      validatedGemini,
      doorwayConfig
    );

    const now = new Date();
    return {
      analysis_id: `ANL-${Date.now().toString(36).toUpperCase()}`,
      analyzed_at_iso: now.toISOString(),
      analyzed_at_dar_es_salaam: formatDarEsSalaamTime(now, true),
      model_used: modelActuallyUsed,
      upload_method: uploadMethod,
      video_metadata: {
        filename: originalFilename,
        mime_type: mimeType,
        size_bytes: fileSizeBytes,
        client_duration_seconds: Math.round(
          clientDurationSeconds || validatedGemini.video_duration_seconds
        ),
      },
      doorway_config: doorwayConfig,
      gemini_raw: validatedGemini,
      deterministic_metrics: deterministicMetrics,
      enriched_events: enrichedEvents,
    };
  } finally {
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch {}
    if (geminiRemoteFileName) {
      aiClient.files.delete({ name: geminiRemoteFileName }).catch(() => {});
    }
  }
}

function classifyAnalysisError(err: unknown): {
  status: number;
  error_code: string;
  message: string;
  technical_detail: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return {
      status: 503,
      error_code: 'GEMINI_MODEL_HIGH_DEMAND',
      message:
        'All free-tier Gemini models are momentarily experiencing high demand (HTTP 503 UNAVAILABLE). Please wait 10–20 seconds and click ANALYZE VIDEO again.',
      technical_detail: message,
    };
  }

  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      error_code: 'GEMINI_QUOTA_EXCEEDED',
      message:
        'Gemini API Free-Tier rate limit or quota reached (HTTP 429 RESOURCE_EXHAUSTED). Please wait 30–60 seconds before analyzing another video, or attach a billing-enabled API key in Settings > Secrets.',
      technical_detail: message,
    };
  }

  if (
    lower.includes('403') ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid')
  ) {
    return {
      status: 403,
      error_code: 'GEMINI_AUTH_ERROR',
      message:
        'Gemini API key authentication failed (PERMISSION_DENIED / API_KEY_INVALID). Please check your GEMINI_API_KEY in the Google AI Studio Settings > Secrets panel.',
      technical_detail: message,
    };
  }

  if (message.startsWith('EMPTY_GEMINI_RESPONSE:')) {
    return {
      status: 502,
      error_code: 'EMPTY_GEMINI_RESPONSE',
      message: message.replace('EMPTY_GEMINI_RESPONSE: ', ''),
      technical_detail: message,
    };
  }

  if (message.startsWith('INVALID_GEMINI_JSON:')) {
    return {
      status: 502,
      error_code: 'INVALID_GEMINI_JSON',
      message: 'Gemini returned malformed JSON that could not be parsed.',
      technical_detail: message,
    };
  }

  return {
    status: 500,
    error_code: 'VIDEO_ANALYSIS_FAILED',
    message: `Video analysis failed: ${message}`,
    technical_detail: message,
  };
}

async function startServer() {
  const app = express();

  // Room endpoints reject oversized payloads early. Because body-parser marks
  // the request as parsed, the global 15 MB parser below will skip these.
  app.use(
    ['/api/rooms', '/api/room-categories'],
    express.json({ limit: '64kb' })
  );
  app.use('/api/room-import', express.json({ limit: '2mb' }));
  app.use(express.json({ limit: '15mb' }));

  // GATE 2.0 — room inventory (PostgreSQL-backed)
  app.use('/api/rooms', createRoomsRouter());
  app.use('/api/room-categories', createRoomCategoriesRouter());
  app.use('/api/room-import', createRoomImportRouter());

  // Health & Model Capability Endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    const hasKey = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    );
    res.json({
      status: 'ok',
      application: 'ENKAI LODGEFLOW',
      phase: 'Phase 2 — Gate 2.0: Room server migration',
      gemini_configured: hasKey,
      database_configured: isDatabaseConfigured(),
      model: GEMINI_FREE_TIER_MODEL,
      free_tier_compatible: true,
      supported_formats: ['MP4', 'MOV', 'WEBM', 'AVI', 'MPEG', '3GPP'],
      max_upload_mb: 100,
      timezone: 'Africa/Dar_es_Salaam',
      server_time_dar_es_salaam: formatDarEsSalaamTime(new Date(), true),
    });
  });

  // ============================================================================
  // CHUNKED UPLOAD & ASYNC POLLING PIPELINE (Prevents Proxy Timeouts / 413s)
  // ============================================================================

  // 1. Initialize a chunked video upload session
  app.post('/api/upload-init', (req: Request, res: Response) => {
    const { filename, mimeType: rawMime, totalSize } = req.body || {};
    if (!filename || typeof totalSize !== 'number' || totalSize <= 0) {
      return res.status(400).json({
        error_code: 'INVALID_UPLOAD_INIT',
        message: 'Valid filename and non-zero file size are required to initialize upload.',
      });
    }

    if (totalSize > MAX_VIDEO_SIZE_BYTES) {
      return res.status(413).json({
        error_code: 'VIDEO_TOO_LARGE',
        message: `Selected video (${(totalSize / (1024 * 1024)).toFixed(1)} MB) exceeds the 100 MB prototype limit.`,
      });
    }

    const resolvedMime = resolveMimeTypeByNameAndType(filename, rawMime || '');
    if (!SUPPORTED_VIDEO_MIMES.has(resolvedMime)) {
      return res.status(415).json({
        error_code: 'UNSUPPORTED_VIDEO_FORMAT',
        message: `Unsupported file format (${rawMime || path.extname(filename)}). Supported CCTV video formats: MP4, MOV, WebM, AVI, MPEG, 3GPP.`,
      });
    }

    const uploadId = `UPL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(uploadDir, `${uploadId}-${safeName}`);
    fs.writeFileSync(filePath, Buffer.alloc(0));

    uploadSessions.set(uploadId, {
      uploadId,
      filename,
      mimeType: resolvedMime,
      totalSize,
      receivedBytes: 0,
      filePath,
      createdAt: Date.now(),
    });

    return res.json({
      uploadId,
      mimeType: resolvedMime,
    });
  });

  // 2. Append binary chunk (up to 5MB raw body per chunk)
  app.post(
    '/api/upload-chunk',
    express.raw({ type: 'application/octet-stream', limit: '8mb' }),
    (req: Request, res: Response) => {
      const uploadId = String(req.headers['x-upload-id'] || '');
      const session = uploadSessions.get(uploadId);
      if (!session) {
        return res.status(404).json({
          error_code: 'UPLOAD_SESSION_NOT_FOUND',
          message: 'Upload session expired or not found. Please try uploading again.',
        });
      }

      const chunkBuf = req.body as Buffer;
      if (!Buffer.isBuffer(chunkBuf) || chunkBuf.length === 0) {
        return res.status(400).json({
          error_code: 'EMPTY_CHUNK',
          message: 'Received empty video chunk.',
        });
      }

      if (session.receivedBytes + chunkBuf.length > MAX_VIDEO_SIZE_BYTES) {
        return res.status(413).json({
          error_code: 'VIDEO_TOO_LARGE',
          message: 'Uploaded chunks exceed the 100 MB limit.',
        });
      }

      fs.appendFileSync(session.filePath, chunkBuf);
      session.receivedBytes += chunkBuf.length;

      return res.json({
        uploadId,
        receivedBytes: session.receivedBytes,
        totalSize: session.totalSize,
        progressPct: Math.min(100, Math.round((session.receivedBytes / session.totalSize) * 100)),
      });
    }
  );

  // 3. Start background Gemini Video Analysis job (Returns immediately in <50ms)
  app.post('/api/analyze-start', (req: Request, res: Response) => {
    const { uploadId, config, clientDurationSeconds } = req.body || {};
    const session = uploadSessions.get(String(uploadId || ''));
    if (!session || !fs.existsSync(session.filePath)) {
      return res.status(404).json({
        error_code: 'UPLOAD_SESSION_NOT_FOUND',
        message: 'Uploaded video file was not found on the server. Please re-select the video and try again.',
      });
    }

    uploadSessions.delete(session.uploadId);

    let doorwayConfig: DoorwayConfig = {
      roomId: 'ROOM-101',
      cameraId: 'CAM-CORRIDOR-01',
      registeredGuestCount: 2,
      initialOccupancyBeforeVideo: 0,
      cameraAngle: 'CORRIDOR_OBLIQUE',
      doorwayPosition: 'LEFT_WALL',
      insideDirection: 'INTO_LEFT_DOOR',
      thresholdZone: { x: 14, y: 20, width: 15, height: 45 },
    };

    if (config && typeof config === 'object') {
      doorwayConfig = { ...doorwayConfig, ...config };
    }

    const jobId = `JOB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const job: AnalysisJob = {
      jobId,
      status: 'QUEUED',
      stageMessage: 'Queued for Gemini 3.8 Flash video analysis...',
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    analysisJobs.set(jobId, job);

    // Launch non-blocking background execution
    (async () => {
      try {
        const result = await executeVideoAnalysisPipeline({
          localFilePath: session.filePath,
          originalFilename: session.filename,
          mimeType: session.mimeType,
          fileSizeBytes: session.receivedBytes,
          doorwayConfig,
          clientDurationSeconds: Number(clientDurationSeconds) || 0,
          onStageUpdate: (status, stageMessage) => {
            job.status = status;
            job.stageMessage = stageMessage;
            job.updatedAt = Date.now();
          },
        });
        job.status = 'COMPLETED';
        job.stageMessage = 'Analysis completed.';
        job.result = result;
        job.updatedAt = Date.now();
      } catch (err) {
        const classified = classifyAnalysisError(err);
        job.status = 'FAILED';
        job.stageMessage = classified.message;
        job.error = {
          error_code: classified.error_code,
          message: classified.message,
          technical_detail: classified.technical_detail,
        };
        job.updatedAt = Date.now();
      }
    })();

    return res.json({
      jobId,
      status: job.status,
      stageMessage: job.stageMessage,
    });
  });

  // 4. Poll job status (Returns in <5ms, immune to proxy timeouts)
  app.get('/api/analyze-status/:jobId', (req: Request, res: Response) => {
    const job = analysisJobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({
        error_code: 'JOB_NOT_FOUND',
        message: 'Analysis job was not found or expired.',
      });
    }

    const elapsedSeconds = Math.round((Date.now() - job.startedAt) / 1000);
    return res.json({
      jobId: job.jobId,
      status: job.status,
      stageMessage: job.stageMessage,
      elapsedSeconds,
      result: job.result || null,
      error: job.error || null,
    });
  });

  // Deterministic Engine Verification Suite Endpoint (Tests Sections 5, 6, 7, 10)
  app.post('/api/verify-engine', (_req: Request, res: Response) => {
    const baseConfig: DoorwayConfig = {
      roomId: 'ROOM-101',
      cameraId: 'CAM-CORRIDOR-01',
      registeredGuestCount: 2,
      initialOccupancyBeforeVideo: 0,
      cameraAngle: 'CORRIDOR_OBLIQUE',
      doorwayPosition: 'LEFT_WALL',
      insideDirection: 'INTO_LEFT_DOOR',
      thresholdZone: { x: 14, y: 20, width: 15, height: 45 },
    };

    const section5Raw = validateAndNormalizeGeminiOutput(
      {
        room_id: 'ROOM-101',
        video_duration_seconds: 240,
        analysis_summary:
          'Multi-person entry, temporary exit, re-entry, and full exit sequence.',
        events: [
          {
            event_id: 'EVT-001',
            person_id: 'PERSON-A',
            event_type: 'ENTRY',
            video_timestamp: '00:00:15',
            confidence: 0.96,
            verification_status: 'CONFIRMED',
            direction_established: true,
            crossed_doorway_threshold: true,
            evidence_description: 'Person A enters doorway at 00:15.',
          },
          {
            event_id: 'EVT-002',
            person_id: 'PERSON-B',
            event_type: 'ENTRY',
            video_timestamp: '00:00:40',
            confidence: 0.94,
            verification_status: 'CONFIRMED',
            direction_established: true,
            crossed_doorway_threshold: true,
            evidence_description: 'Person B enters doorway at 00:40.',
          },
          {
            event_id: 'EVT-003',
            person_id: 'PERSON-A',
            event_type: 'EXIT',
            video_timestamp: '00:01:30',
            confidence: 0.95,
            verification_status: 'CONFIRMED',
            direction_established: true,
            crossed_doorway_threshold: true,
            evidence_description: 'Person A exits doorway at 01:30.',
          },
          {
            event_id: 'EVT-004',
            person_id: 'PERSON-A',
            event_type: 'ENTRY',
            video_timestamp: '00:02:00',
            confidence: 0.93,
            verification_status: 'CONFIRMED',
            direction_established: true,
            crossed_doorway_threshold: true,
            evidence_description: 'Person A returns and re-enters at 02:00.',
          },
          {
            event_id: 'EVT-005',
            person_id: 'PERSON-B',
            event_type: 'EXIT',
            video_timestamp: '00:03:00',
            confidence: 0.95,
            verification_status: 'CONFIRMED',
            direction_established: true,
            crossed_doorway_threshold: true,
            evidence_description: 'Person B exits doorway at 03:00.',
          },
          {
            event_id: 'EVT-006',
            person_id: 'PERSON-A',
            event_type: 'EXIT',
            video_timestamp: '00:03:30',
            confidence: 0.97,
            verification_status: 'CONFIRMED',
            direction_established: true,
            crossed_doorway_threshold: true,
            evidence_description: 'Person A exits doorway at 03:30.',
          },
        ],
        occupancy: { current_count: 0, peak_count: 2, total_entries: 3, total_exits: 3 },
        unverified_events: [],
        analysis_limitations: [],
      },
      'ROOM-101',
      240
    );

    const section5Result = computeDeterministicOccupancy(section5Raw, baseConfig);
    const handoverAfterZero = deriveNextRoomStateFromCctv(
      'OCCUPIED',
      section5Result.deterministicMetrics
    );

    const edgeCaseRaw = validateAndNormalizeGeminiOutput(
      {
        room_id: 'ROOM-101',
        video_duration_seconds: 60,
        analysis_summary: 'Edge case test for corridor passerby, unknown direction, and negative clamp.',
        events: [
          {
            event_id: 'EVT-101',
            person_id: 'PERSON-X',
            event_type: 'EXIT',
            video_timestamp: '00:00:05',
            confidence: 0.91,
            verification_status: 'CONFIRMED',
            direction_established: true,
            crossed_doorway_threshold: true,
            evidence_description: 'Person exits when initial occupancy was 0.',
          },
          {
            event_id: 'EVT-102',
            person_id: 'PERSON-Y',
            event_type: 'CORRIDOR_PASS',
            video_timestamp: '00:00:15',
            confidence: 0.95,
            verification_status: 'CONFIRMED',
            direction_established: true,
            crossed_doorway_threshold: false,
            evidence_description: 'Person walks down hallway past room without entering.',
          },
          {
            event_id: 'EVT-103',
            person_id: 'PERSON-Z',
            event_type: 'UNKNOWN',
            video_timestamp: '00:00:25',
            confidence: 0.45,
            verification_status: 'UNCERTAIN',
            direction_established: false,
            crossed_doorway_threshold: false,
            evidence_description: 'Camera angle obstructed; cannot confirm doorway entry.',
          },
        ],
        occupancy: { current_count: 0, peak_count: 0, total_entries: 0, total_exits: 0 },
        unverified_events: [],
        analysis_limitations: ['Camera occlusion at 00:00:25'],
      },
      'ROOM-101',
      60
    );

    const edgeCaseResult = computeDeterministicOccupancy(edgeCaseRaw, baseConfig);

    res.json({
      passed:
        section5Result.deterministicMetrics.peak_count === 2 &&
        section5Result.deterministicMetrics.total_entries === 3 &&
        section5Result.deterministicMetrics.total_exits === 3 &&
        section5Result.deterministicMetrics.current_count === 0 &&
        section5Result.deterministicMetrics.re_entry_count === 1 &&
        handoverAfterZero.nextState === 'TEMPORARILY_VACANT' &&
        edgeCaseResult.deterministicMetrics.current_count === 0 &&
        edgeCaseResult.deterministicMetrics.corridor_pass_count === 1,
      section5_multi_person_metrics: section5Result.deterministicMetrics,
      handover_lifecycle_transition: handoverAfterZero,
      edge_case_metrics: edgeCaseResult.deterministicMetrics,
    });
  });

  // Direct Multipart Endpoint (kept for backwards compatibility)
  app.post(
    '/api/analyze-video',
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('video')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
              error_code: 'VIDEO_TOO_LARGE',
              message: `Uploaded video exceeds the 100 MB prototype limit. Please upload a shorter CCTV clip.`,
            });
          }
          return res.status(400).json({
            error_code: 'UPLOAD_ERROR',
            message: `File upload error: ${err.message}`,
          });
        } else if (err) {
          return res.status(500).json({
            error_code: 'UPLOAD_ERROR',
            message: err instanceof Error ? err.message : 'Unexpected upload error.',
          });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      const uploadedFile = req.file;
      if (!uploadedFile) {
        return res.status(400).json({
          error_code: 'MISSING_VIDEO_FILE',
          message: 'No video file was received by the server. Please select a valid CCTV video file first.',
        });
      }

      if (uploadedFile.size === 0) {
        try {
          if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
        } catch {}
        return res.status(400).json({
          error_code: 'EMPTY_VIDEO_FILE',
          message: 'The uploaded video file is empty (0 bytes). Please select a valid recording.',
        });
      }

      const mimeType = resolveMimeTypeByNameAndType(
        uploadedFile.originalname,
        uploadedFile.mimetype
      );
      if (!SUPPORTED_VIDEO_MIMES.has(mimeType)) {
        try {
          if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
        } catch {}
        return res.status(415).json({
          error_code: 'UNSUPPORTED_VIDEO_FORMAT',
          message: `Unsupported file format (${uploadedFile.mimetype || path.extname(uploadedFile.originalname)}). Supported CCTV video formats: MP4, MOV, WebM, AVI, MPEG, 3GPP.`,
        });
      }

      let doorwayConfig: DoorwayConfig = {
        roomId: 'ROOM-101',
        cameraId: 'CAM-CORRIDOR-01',
        registeredGuestCount: 2,
        initialOccupancyBeforeVideo: 0,
        cameraAngle: 'CORRIDOR_OBLIQUE',
        doorwayPosition: 'LEFT_WALL',
        insideDirection: 'INTO_LEFT_DOOR',
        thresholdZone: { x: 14, y: 20, width: 15, height: 45 },
      };

      if (req.body && req.body.config) {
        try {
          const parsed =
            typeof req.body.config === 'string'
              ? JSON.parse(req.body.config)
              : req.body.config;
          doorwayConfig = { ...doorwayConfig, ...parsed };
        } catch {}
      }

      const clientDurationSeconds = Number(req.body?.clientDurationSeconds) || 0;

      try {
        const fullResult = await executeVideoAnalysisPipeline({
          localFilePath: uploadedFile.path,
          originalFilename: uploadedFile.originalname,
          mimeType,
          fileSizeBytes: uploadedFile.size,
          doorwayConfig,
          clientDurationSeconds,
        });
        return res.json(fullResult);
      } catch (err) {
        const classified = classifyAnalysisError(err);
        return res.status(classified.status).json({
          error_code: classified.error_code,
          message: classified.message,
          technical_detail: classified.technical_detail,
        });
      }
    }
  );

  const publicPath = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ENKAI LODGEFLOW server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ENKAI LODGEFLOW server:', err);
  process.exit(1);
});
