import {
  AccuracyValidationReport,
  DoorwayConfig,
  DeterministicOccupancyMetrics,
  EnrichedRoomEvent,
  EventComparisonMatch,
  EventType,
  FullAnalysisResult,
  GeminiEventItem,
  GeminiVideoAnalysisResponse,
  HumanGroundTruthSpec,
  OccupancyCalculationDiff,
  PersonStayDuration,
  RoomLifecycleState,
  TemporaryVacantPeriod,
  VerificationStatus,
} from '../types/lodgeflow';

export const DAR_ES_SALAAM_TZ = 'Africa/Dar_es_Salaam';

/**
 * Formats an ISO or Date object into Africa/Dar_es_Salaam time string (e.g., "08:15:30 PM EAT")
 */
export function formatDarEsSalaamTime(dateOrIso: Date | string, includeDate = false): string {
  const date = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  if (Number.isNaN(date.getTime())) {
    return 'Invalid Timestamp';
  }
  const options: Intl.DateTimeFormatOptions = {
    timeZone: DAR_ES_SALAAM_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    ...(includeDate ? { year: 'numeric', month: 'short', day: '2-digit' } : {}),
  };
  return `${new Intl.DateTimeFormat('en-US', options).format(date)} EAT`;
}

/**
 * Parses a video-relative timestamp string ("00:00:15", "01:30", "00:03:30.5", or "90s") into seconds.
 */
export function parseVideoTimestampToSeconds(raw: string | number | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  if (!raw || typeof raw !== 'string') {
    return 0;
  }
  const cleaned = raw.trim().replace(/s$/i, '');
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    return Math.max(0, Math.round(parseFloat(cleaned)));
  }
  const parts = cleaned.split(':').map((p) => parseFloat(p));
  if (parts.some((n) => Number.isNaN(n))) {
    return 0;
  }
  if (parts.length === 3) {
    return Math.max(0, Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]));
  }
  if (parts.length === 2) {
    return Math.max(0, Math.round(parts[0] * 60 + parts[1]));
  }
  return 0;
}

/**
 * Formats seconds into canonical video-relative "HH:MM:SS"
 */
export function formatSecondsToVideoTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

/**
 * Formats stay or vacancy duration in seconds into human-readable "03h 25m" or "00h 01m 15s"
 */
export function formatDurationSeconds(durationSeconds: number): string {
  const safe = Math.max(0, Math.round(durationSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0 && secs === 0) {
    return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
  }
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }
  return `00h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

/**
 * Validates and normalizes the raw JSON returned by Gemini to ensure strict compliance with Section 8.
 */
export function validateAndNormalizeGeminiOutput(
  rawInput: unknown,
  fallbackRoomId: string,
  fallbackDurationSeconds: number
): GeminiVideoAnalysisResponse {
  if (!rawInput || typeof rawInput !== 'object') {
    throw new Error('Gemini returned an empty or non-object JSON payload.');
  }

  const obj = rawInput as Record<string, unknown>;
  const roomId = typeof obj.room_id === 'string' && obj.room_id.trim() ? obj.room_id.trim() : fallbackRoomId;
  const videoDuration =
    typeof obj.video_duration_seconds === 'number' && obj.video_duration_seconds > 0
      ? Math.round(obj.video_duration_seconds)
      : Math.max(1, Math.round(fallbackDurationSeconds || 0));

  const analysisSummary =
    typeof obj.analysis_summary === 'string' && obj.analysis_summary.trim()
      ? obj.analysis_summary.trim()
      : 'No summary provided by model.';

  const detectedOsdTimestamp =
    typeof obj.detected_osd_real_timestamp === 'string' && obj.detected_osd_real_timestamp.trim()
      ? obj.detected_osd_real_timestamp.trim()
      : null;

  const validEventTypes: EventType[] = ['ENTRY', 'EXIT', 'RE_ENTRY', 'CORRIDOR_PASS', 'UNKNOWN'];
  const validStatuses: VerificationStatus[] = ['CONFIRMED', 'UNVERIFIED', 'UNCERTAIN'];

  const rawEvents = Array.isArray(obj.events) ? obj.events : [];
  const events: GeminiEventItem[] = rawEvents.map((item, idx) => {
    const ev = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const rawType = String(ev.event_type || 'UNKNOWN').toUpperCase() as EventType;
    const eventType: EventType = validEventTypes.includes(rawType) ? rawType : 'UNKNOWN';

    const rawStatus = String(ev.verification_status || 'UNVERIFIED').toUpperCase() as VerificationStatus;
    const verificationStatus: VerificationStatus = validStatuses.includes(rawStatus) ? rawStatus : 'UNVERIFIED';

    const sec = parseVideoTimestampToSeconds(ev.video_timestamp as string);
    const confidence =
      typeof ev.confidence === 'number' && Number.isFinite(ev.confidence)
        ? Math.min(1, Math.max(0, Number(ev.confidence.toFixed(2))))
        : 0.5;

    return {
      event_id:
        typeof ev.event_id === 'string' && ev.event_id.trim()
          ? ev.event_id.trim()
          : `EVT-${String(idx + 1).padStart(3, '0')}`,
      person_id:
        typeof ev.person_id === 'string' && ev.person_id.trim()
          ? ev.person_id.trim().toUpperCase()
          : `PERSON-UNKNOWN-${idx + 1}`,
      event_type: eventType,
      video_timestamp: formatSecondsToVideoTimestamp(sec),
      confidence,
      verification_status: verificationStatus,
      direction_established:
        typeof ev.direction_established === 'boolean'
          ? ev.direction_established
          : eventType !== 'UNKNOWN',
      crossed_doorway_threshold:
        typeof ev.crossed_doorway_threshold === 'boolean'
          ? ev.crossed_doorway_threshold
          : eventType === 'ENTRY' || eventType === 'EXIT' || eventType === 'RE_ENTRY',
      appearance_descriptor:
        typeof ev.appearance_descriptor === 'string' ? ev.appearance_descriptor.trim() : undefined,
      evidence_description:
        typeof ev.evidence_description === 'string' && ev.evidence_description.trim()
          ? ev.evidence_description.trim()
          : 'Observed in corridor CCTV frame.',
    };
  });

  const rawUnverified = Array.isArray(obj.unverified_events) ? obj.unverified_events : [];
  const unverifiedEvents = rawUnverified.map((item, idx) => {
    const uv = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const sec = parseVideoTimestampToSeconds(uv.video_timestamp as string);
    return {
      event_id:
        typeof uv.event_id === 'string' && uv.event_id.trim()
          ? uv.event_id.trim()
          : `UNV-${String(idx + 1).padStart(3, '0')}`,
      person_id:
        typeof uv.person_id === 'string' && uv.person_id.trim()
          ? uv.person_id.trim().toUpperCase()
          : 'PERSON-UNCERTAIN',
      video_timestamp: formatSecondsToVideoTimestamp(sec),
      reason_unverified:
        typeof uv.reason_unverified === 'string' && uv.reason_unverified.trim()
          ? uv.reason_unverified.trim()
          : 'Insufficient visual evidence of doorway crossing.',
      confidence:
        typeof uv.confidence === 'number' && Number.isFinite(uv.confidence)
          ? Math.min(1, Math.max(0, Number(uv.confidence.toFixed(2))))
          : 0.4,
      evidence_description:
        typeof uv.evidence_description === 'string' && uv.evidence_description.trim()
          ? uv.evidence_description.trim()
          : 'Ambiguous movement near room doorway.',
    };
  });

  const limitations = Array.isArray(obj.analysis_limitations)
    ? obj.analysis_limitations.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

  const rawOcc = (obj.occupancy && typeof obj.occupancy === 'object' ? obj.occupancy : {}) as Record<
    string,
    unknown
  >;

  return {
    room_id: roomId,
    video_duration_seconds: videoDuration,
    detected_osd_real_timestamp: detectedOsdTimestamp,
    analysis_summary: analysisSummary,
    events,
    occupancy: {
      current_count: typeof rawOcc.current_count === 'number' ? Math.max(0, rawOcc.current_count) : 0,
      peak_count: typeof rawOcc.peak_count === 'number' ? Math.max(0, rawOcc.peak_count) : 0,
      total_entries: typeof rawOcc.total_entries === 'number' ? Math.max(0, rawOcc.total_entries) : 0,
      total_exits: typeof rawOcc.total_exits === 'number' ? Math.max(0, rawOcc.total_exits) : 0,
    },
    unverified_events: unverifiedEvents,
    analysis_limitations: limitations,
    camera_angle_assessment:
      typeof obj.camera_angle_assessment === 'string' ? obj.camera_angle_assessment : undefined,
    video_quality_assessment:
      typeof obj.video_quality_assessment === 'string' ? obj.video_quality_assessment : undefined,
  };
}

/**
 * Core Deterministic Room Occupancy & Stay Duration Engine (Sections 5, 6, 7).
 * Strictly enforces:
 * - ENTRY: Increase occupancy by 1 only when a valid entry is CONFIRMED and crosses doorway.
 * - EXIT: Decrease occupancy by 1 only when a valid exit is CONFIRMED and can be associated with an occupant (or initial occupancy > 0).
 * - CORRIDOR_PASS / UNKNOWN: Never alters room occupancy.
 * - Never allows occupancy to become negative.
 * - Prevents duplicate event counting within a 2-second window.
 * - Computes individual stay durations when same person's entry and exit are reliably paired.
 * - Uses Africa/Dar_es_Salaam clock time ONLY when real recording start time or OSD clock is available.
 */
export function computeDeterministicOccupancy(
  geminiResponse: GeminiVideoAnalysisResponse,
  config: DoorwayConfig
): {
  deterministicMetrics: DeterministicOccupancyMetrics;
  enrichedEvents: EnrichedRoomEvent[];
} {
  // Determine if a valid real-world clock start time exists
  let baseStartDate: Date | null = null;
  if (config.recordingStartIso && config.recordingStartIso.trim()) {
    const parsed = new Date(config.recordingStartIso);
    if (!Number.isNaN(parsed.getTime())) {
      baseStartDate = parsed;
    }
  } else if (
    geminiResponse.detected_osd_real_timestamp &&
    geminiResponse.detected_osd_real_timestamp.trim()
  ) {
    const parsed = new Date(geminiResponse.detected_osd_real_timestamp);
    if (!Number.isNaN(parsed.getTime())) {
      baseStartDate = parsed;
    }
  }

  const computeClockTime = (offsetSeconds: number): string | null => {
    if (!baseStartDate) return null;
    const eventDate = new Date(baseStartDate.getTime() + offsetSeconds * 1000);
    return formatDarEsSalaamTime(eventDate, false);
  };

  // Merge any unverified_events that were not also listed in events so they appear on the timeline and in accuracy validation as UNKNOWN/UNVERIFIED
  const combinedRawEvents: GeminiEventItem[] = [...geminiResponse.events];
  for (const uv of geminiResponse.unverified_events) {
    const uvSec = parseVideoTimestampToSeconds(uv.video_timestamp);
    const alreadyInEvents = combinedRawEvents.some(
      (e) => Math.abs(parseVideoTimestampToSeconds(e.video_timestamp) - uvSec) <= 2
    );
    if (!alreadyInEvents) {
      combinedRawEvents.push({
        event_id: uv.event_id,
        person_id: uv.person_id || 'PERSON-UNCERTAIN',
        event_type: 'UNKNOWN',
        video_timestamp: uv.video_timestamp,
        confidence: uv.confidence,
        verification_status: 'UNVERIFIED',
        direction_established: false,
        crossed_doorway_threshold: false,
        evidence_description: `${uv.reason_unverified} — ${uv.evidence_description}`,
      });
    }
  }

  // Sort events chronologically by video_timestamp
  const sortedRaw = combinedRawEvents.sort(
    (a, b) =>
      parseVideoTimestampToSeconds(a.video_timestamp) -
      parseVideoTimestampToSeconds(b.video_timestamp)
  );

  let currentCount = Math.max(0, config.initialOccupancyBeforeVideo || 0);
  let peakCount = currentCount;
  let totalEntries = 0;
  let totalExits = 0;
  let reEntryCount = 0;
  let corridorPassCount = 0;
  let unverifiedEventCount = 0;
  let duplicateEventsFiltered = 0;

  // Track which person IDs have previously entered and exited in this video
  const completedStayPersons = new Set<string>();
  // Map of currently inside person_id -> active stay record index in personStays
  const activeOccupantStayMap = new Map<string, number>();
  // Track anonymous initial occupants before video start if initialOccupancyBeforeVideo > 0
  let unmatchedInitialOccupants = Math.max(0, config.initialOccupancyBeforeVideo || 0);

  const personStays: PersonStayDuration[] = [];
  const temporaryVacantPeriods: TemporaryVacantPeriod[] = [];
  let hasBeenOccupied = currentCount > 0;
  let activeVacantPeriodIndex: number | null = null;

  const enrichedEvents: EnrichedRoomEvent[] = [];

  for (let i = 0; i < sortedRaw.length; i++) {
    const ev = sortedRaw[i];
    const timestampSeconds = parseVideoTimestampToSeconds(ev.video_timestamp);
    const formattedRelative = formatSecondsToVideoTimestamp(timestampSeconds);
    const clockTime = computeClockTime(timestampSeconds);

    // Check for duplicate event: same person_id and same event_type within 2 seconds
    const prevSame = enrichedEvents
      .slice()
      .reverse()
      .find(
        (prev) =>
          !prev.is_duplicate_ignored &&
          prev.person_id === ev.person_id &&
          (prev.event_type === ev.event_type ||
            (prev.event_type === 'ENTRY' && ev.event_type === 'RE_ENTRY') ||
            (prev.event_type === 'RE_ENTRY' && ev.event_type === 'ENTRY'))
      );

    if (prevSame && Math.abs(timestampSeconds - prevSame.timestamp_seconds) <= 2) {
      duplicateEventsFiltered += 1;
      enrichedEvents.push({
        ...ev,
        room_id: config.roomId,
        camera_id: config.cameraId,
        timestamp_seconds: timestampSeconds,
        formatted_relative_time: formattedRelative,
        dar_es_salaam_clock_time: clockTime,
        occupancy_after_event: currentCount,
        occupancy_delta: 0,
        is_duplicate_ignored: true,
        engine_note: `Duplicate event ignored (within 2s of ${prevSame.event_id}).`,
      });
      continue;
    }

    let delta = 0;
    let effectiveType: EventType = ev.event_type;
    let engineNote = '';

    const isPassByEvidence =
      /\b(walks?\s+past|pass(es|ed|ing)\s+(by|through|in\s+front|the\s+door)|without\s+(entering|crossing)|approaches?\s+(the\s+)?door(way)?\s+(only|without|and\s+stops))\b/i.test(
        ev.evidence_description
      );

    const isObscuredEvidence =
      /\b(obscured|occluded|cannot\s+(establish|confirm|determine)|unclear\s+direction|ambiguous)\b/i.test(
        ev.evidence_description
      );

    // Rule 4: Do not allow events outside the video duration (allow 1s rounding tolerance)
    if (
      geminiResponse.video_duration_seconds > 0 &&
      timestampSeconds > geminiResponse.video_duration_seconds + 1
    ) {
      unverifiedEventCount += 1;
      enrichedEvents.push({
        ...ev,
        event_type: 'UNKNOWN',
        verification_status: 'UNVERIFIED',
        room_id: config.roomId,
        camera_id: config.cameraId,
        timestamp_seconds: timestampSeconds,
        formatted_relative_time: formattedRelative,
        dar_es_salaam_clock_time: clockTime,
        occupancy_after_event: currentCount,
        occupancy_delta: 0,
        is_duplicate_ignored: true,
        engine_note: `Event timestamp (${formattedRelative}) exceeds video duration (${geminiResponse.video_duration_seconds}s); rejected per Phase 0.3 Rule 4.`,
      });
      continue;
    }

    // Rule 1, 2, 3: Do not interpret approaching or walking past a doorway as entering; require threshold crossing
    if (
      (ev.event_type === 'ENTRY' || ev.event_type === 'RE_ENTRY' || ev.event_type === 'EXIT') &&
      isPassByEvidence &&
      !ev.crossed_doorway_threshold
    ) {
      effectiveType = 'CORRIDOR_PASS';
    } else if (
      (ev.event_type === 'ENTRY' || ev.event_type === 'RE_ENTRY' || ev.event_type === 'EXIT') &&
      (!ev.crossed_doorway_threshold || !ev.direction_established || isObscuredEvidence)
    ) {
      effectiveType = isPassByEvidence ? 'CORRIDOR_PASS' : 'UNKNOWN';
    }

    const isConfirmedCrossing =
      ev.verification_status === 'CONFIRMED' &&
      ev.confidence >= 0.6 &&
      ev.crossed_doorway_threshold === true &&
      ev.direction_established === true &&
      !isPassByEvidence &&
      !isObscuredEvidence;

    if (effectiveType === 'CORRIDOR_PASS') {
      corridorPassCount += 1;
      engineNote =
        'Person walked past or approached in corridor without crossing doorway threshold. Occupancy unchanged (Rules 1 & 2).';
    } else if (
      effectiveType === 'UNKNOWN' ||
      ev.verification_status !== 'CONFIRMED' ||
      !isConfirmedCrossing
    ) {
      effectiveType = 'UNKNOWN';
      unverifiedEventCount += 1;
      engineNote =
        'Uncertain or unverified doorway crossing/direction. Does not automatically alter confirmed occupancy (Rule 3).';
    } else if (effectiveType === 'ENTRY' || effectiveType === 'RE_ENTRY') {
      // Check if this person is already marked inside without an exit
      if (activeOccupantStayMap.has(ev.person_id)) {
        unverifiedEventCount += 1;
        engineNote = `${ev.person_id} is already recorded inside the room; duplicate entry prevented.`;
      } else {
        // Rule 6: Do not claim identity continuity (RE_ENTRY) when visual evidence is insufficient
        const isIdentityUncertain =
          ev.person_id.includes('UNCERTAIN') || ev.person_id.includes('UNKNOWN');
        const isReEntry =
          !isIdentityUncertain &&
          (completedStayPersons.has(ev.person_id) || effectiveType === 'RE_ENTRY');

        if (isReEntry) {
          effectiveType = 'RE_ENTRY';
          reEntryCount += 1;
        } else {
          effectiveType = 'ENTRY';
        }

        // Close any active temporary vacant period if room was vacant after prior occupancy
        if (currentCount === 0 && activeVacantPeriodIndex !== null) {
          const vacPeriod = temporaryVacantPeriods[activeVacantPeriodIndex];
          const vacStartSec = parseVideoTimestampToSeconds(vacPeriod.vacated_at_video_timestamp);
          const vacDur = Math.max(0, timestampSeconds - vacStartSec);
          vacPeriod.reoccupied_at_video_timestamp = formattedRelative;
          vacPeriod.reoccupied_dar_es_salaam_time = clockTime;
          vacPeriod.duration_seconds = vacDur;
          vacPeriod.formatted_duration = formatDurationSeconds(vacDur);
          activeVacantPeriodIndex = null;
        }

        currentCount += 1;
        totalEntries += 1;
        delta = 1;
        hasBeenOccupied = true;
        if (currentCount > peakCount) {
          peakCount = currentCount;
        }

        const stayIndex = personStays.length;
        personStays.push({
          stay_id: `STAY-${String(stayIndex + 1).padStart(2, '0')}`,
          person_id: ev.person_id,
          entry_event_id: ev.event_id,
          exit_event_id: null,
          entry_video_timestamp: formattedRelative,
          exit_video_timestamp: null,
          entry_dar_es_salaam_time: clockTime,
          exit_dar_es_salaam_time: null,
          duration_seconds: null,
          formatted_duration: 'Currently Inside',
          is_re_entry: isReEntry,
          identity_confidence_note: isIdentityUncertain
            ? 'Anonymous tracking ID with uncertain re-identification (no identity continuity claimed).'
            : isReEntry
            ? `Matched returning anonymous track (${ev.person_id}) within clip.`
            : `Tracked anonymous entrant (${ev.person_id}).`,
        });
        activeOccupantStayMap.set(ev.person_id, stayIndex);

        engineNote = isReEntry
          ? `Confirmed re-entry by ${ev.person_id}. Occupancy increased to ${currentCount}.`
          : `Confirmed doorway entry by ${ev.person_id}. Occupancy increased to ${currentCount}.`;
      }
    } else if (effectiveType === 'EXIT') {
      if (currentCount <= 0) {
        // Never allow occupancy to become negative
        unverifiedEventCount += 1;
        engineNote =
          'Exit observed when tracked room occupancy was 0 (person may have been inside prior to recording; set Initial Occupants Before Clip = 1 if known). Occupancy clamped at 0.';
      } else {
        // Try to match to specific person_id first, or fallback to any active occupant if person_id is uncertain
        let matchedStayIdx = activeOccupantStayMap.get(ev.person_id);
        let matchedPersonKey = ev.person_id;

        if (matchedStayIdx === undefined && activeOccupantStayMap.size === 1) {
          // Only pair when there is a single unambiguous active occupant
          const firstEntry = activeOccupantStayMap.entries().next().value;
          if (firstEntry) {
            matchedPersonKey = firstEntry[0];
            matchedStayIdx = firstEntry[1];
          }
        }

        if (matchedStayIdx !== undefined) {
          const stay = personStays[matchedStayIdx];
          const entrySec = parseVideoTimestampToSeconds(stay.entry_video_timestamp);
          const stayDur = Math.max(0, timestampSeconds - entrySec);
          stay.exit_event_id = ev.event_id;
          stay.exit_video_timestamp = formattedRelative;
          stay.exit_dar_es_salaam_time = clockTime;
          stay.duration_seconds = stayDur;
          stay.formatted_duration = formatDurationSeconds(stayDur);
          if (matchedPersonKey !== ev.person_id) {
            stay.identity_confidence_note = `Exit paired with single active occupant (${matchedPersonKey} → ${ev.person_id}).`;
          }
          activeOccupantStayMap.delete(matchedPersonKey);
          completedStayPersons.add(matchedPersonKey);
          completedStayPersons.add(ev.person_id);
          currentCount = Math.max(0, currentCount - 1);
          totalExits += 1;
          delta = -1;
          engineNote = `Confirmed exit by ${ev.person_id} (Stay duration: ${stay.formatted_duration}). Occupancy decreased to ${currentCount}.`;
        } else if (unmatchedInitialOccupants > 0) {
          unmatchedInitialOccupants -= 1;
          currentCount = Math.max(0, currentCount - 1);
          totalExits += 1;
          delta = -1;
          completedStayPersons.add(ev.person_id);
          engineNote = `Confirmed exit by pre-existing occupant (${ev.person_id}). Occupancy decreased to ${currentCount}.`;
        } else {
          unverifiedEventCount += 1;
          engineNote = `Exit could not be reliably associated with a confirmed occupant (Rule 6). Occupancy unchanged.`;
        }

        // If occupancy just dropped to 0 after having been occupied, start a temporary vacant period
        if (delta === -1 && currentCount === 0 && hasBeenOccupied) {
          activeVacantPeriodIndex = temporaryVacantPeriods.length;
          temporaryVacantPeriods.push({
            period_id: `VAC-${String(activeVacantPeriodIndex + 1).padStart(2, '0')}`,
            vacated_at_video_timestamp: formattedRelative,
            reoccupied_at_video_timestamp: null,
            vacated_dar_es_salaam_time: clockTime,
            reoccupied_dar_es_salaam_time: null,
            duration_seconds: null,
            formatted_duration: 'Room Currently Vacant (Temporary Exit)',
          });
        }
      }
    }

    enrichedEvents.push({
      ...ev,
      event_type: effectiveType,
      room_id: config.roomId,
      camera_id: config.cameraId,
      timestamp_seconds: timestampSeconds,
      formatted_relative_time: formattedRelative,
      dar_es_salaam_clock_time: clockTime,
      occupancy_after_event: currentCount,
      occupancy_delta: delta,
      is_duplicate_ignored: false,
      engine_note: engineNote,
    });
  }

  const activeOccupants = Array.from(activeOccupantStayMap.keys());

  let discrepancyWarning: string | null = null;
  if (currentCount > config.registeredGuestCount) {
    discrepancyWarning = `Current room occupancy (${currentCount}) exceeds registered guest count (${config.registeredGuestCount}) by ${
      currentCount - config.registeredGuestCount
    }.`;
  } else if (peakCount > config.registeredGuestCount) {
    discrepancyWarning = `Peak room occupancy (${peakCount}) exceeded registered guest count (${config.registeredGuestCount}) during this clip.`;
  }

  return {
    deterministicMetrics: {
      room_id: config.roomId,
      camera_id: config.cameraId,
      registered_guest_count: config.registeredGuestCount,
      initial_occupancy: Math.max(0, config.initialOccupancyBeforeVideo || 0),
      current_count: currentCount,
      peak_count: peakCount,
      total_entries: totalEntries,
      total_exits: totalExits,
      re_entry_count: reEntryCount,
      corridor_pass_count: corridorPassCount,
      unverified_event_count: unverifiedEventCount,
      duplicate_events_filtered: duplicateEventsFiltered,
      temporary_vacant_periods: temporaryVacantPeriods,
      person_stays: personStays,
      active_occupants: activeOccupants,
      occupancy_discrepancy_warning: discrepancyWarning,
    },
    enrichedEvents,
  };
}

/**
 * Section 10: Room Lifecycle State Recommender
 * Never automatically checks out a room when CCTV occupancy reaches 0.
 */
export function deriveNextRoomStateFromCctv(
  currentState: RoomLifecycleState,
  metrics: DeterministicOccupancyMetrics
): {
  nextState: RoomLifecycleState;
  explanation: string;
} {
  if (metrics.current_count > 0) {
    if (
      currentState === 'CHECKED_IN' ||
      currentState === 'TEMPORARILY_VACANT' ||
      currentState === 'RESERVED' ||
      currentState === 'OCCUPIED'
    ) {
      return {
        nextState: 'OCCUPIED',
        explanation: `CCTV confirmed ${metrics.current_count} person(s) currently inside ${metrics.room_id}.`,
      };
    }
  }

  if (metrics.current_count === 0 && (metrics.total_entries > 0 || metrics.total_exits > 0)) {
    if (currentState === 'OCCUPIED' || currentState === 'CHECKED_IN') {
      return {
        nextState: 'TEMPORARILY_VACANT',
        explanation:
          'All occupants exited the doorway. Per ENKAI LODGEFLOW rules, zero CCTV occupancy transitions the room to TEMPORARILY_VACANT and NEVER triggers automatic checkout.',
      };
    }
  }

  return {
    nextState: currentState,
    explanation: `Room state remains ${currentState}. Staff authorization is required for check-in, checkout, and handover transitions.`,
  };
}

/**
 * PHASE 0.3: Human-Verified Ground Truth Accuracy Comparison Engine
 * Never calculates accuracy from synthetic or assumed ground truth.
 * Compares operator-entered HumanGroundTruthSpec against actual Gemini & Deterministic Engine output.
 */
export function computeAccuracyValidationReport(
  analysisResult: FullAnalysisResult,
  groundTruth: HumanGroundTruthSpec
): AccuracyValidationReport {
  const toleranceSec = Math.max(0, groundTruth.timestamp_tolerance_seconds ?? 3);
  const expectedList = [...groundTruth.expected_events].sort(
    (a, b) =>
      parseVideoTimestampToSeconds(a.video_timestamp) -
      parseVideoTimestampToSeconds(b.video_timestamp)
  );

  // Use non-duplicate detected events
  const detectedList = analysisResult.enriched_events.filter(
    (ev) => !ev.is_duplicate_ignored
  );

  const matchedDetectedIndices = new Set<number>();
  const eventMatches: EventComparisonMatch[] = [];

  let truePositives = 0;
  let falseNegatives = 0;

  for (const exp of expectedList) {
    const expSec = parseVideoTimestampToSeconds(exp.video_timestamp);

    // Find best matching detected event within timestamp tolerance
    let bestIdx = -1;
    let bestDelta = Infinity;

    for (let dIdx = 0; dIdx < detectedList.length; dIdx++) {
      if (matchedDetectedIndices.has(dIdx)) continue;
      const det = detectedList[dIdx];

      const typeMatches =
        det.event_type === exp.event_type ||
        (exp.event_type === 'RE_ENTRY' && det.event_type === 'ENTRY') ||
        (exp.event_type === 'ENTRY' && det.event_type === 'RE_ENTRY' && exp.notes?.toLowerCase().includes('re-entry'));

      if (!typeMatches) continue;

      const personMatches =
        !exp.person_id ||
        exp.person_id.toUpperCase() === 'ANY' ||
        det.person_id.toUpperCase() === exp.person_id.toUpperCase();

      if (!personMatches) continue;

      const delta = Math.abs(det.timestamp_seconds - expSec);
      if (delta <= toleranceSec && delta < bestDelta) {
        bestDelta = delta;
        bestIdx = dIdx;
      }
    }

    if (bestIdx !== -1) {
      matchedDetectedIndices.add(bestIdx);
      const det = detectedList[bestIdx];
      truePositives += 1;
      eventMatches.push({
        match_type: 'TRUE_POSITIVE',
        expected_event: exp,
        detected_event: det,
        timestamp_delta_seconds: bestDelta,
        explanation: `Matched ${det.event_type} (${det.person_id}) at ${det.formatted_relative_time} (Δ ${bestDelta}s, within ±${toleranceSec}s tolerance).`,
      });
    } else {
      falseNegatives += 1;
      eventMatches.push({
        match_type: 'FALSE_NEGATIVE',
        expected_event: exp,
        detected_event: null,
        timestamp_delta_seconds: null,
        explanation: `Expected ${exp.event_type} (${exp.person_id}) at ${formatSecondsToVideoTimestamp(expSec)} was not detected within ±${toleranceSec}s.`,
      });
    }
  }

  let falsePositives = 0;
  for (let dIdx = 0; dIdx < detectedList.length; dIdx++) {
    if (!matchedDetectedIndices.has(dIdx)) {
      const det = detectedList[dIdx];
      falsePositives += 1;
      eventMatches.push({
        match_type: 'FALSE_POSITIVE',
        expected_event: null,
        detected_event: det,
        timestamp_delta_seconds: null,
        explanation: `Detected ${det.event_type} (${det.person_id}) at ${det.formatted_relative_time} was not present in human-verified ground truth.`,
      });
    }
  }

  const precision =
    truePositives + falsePositives > 0
      ? Number((truePositives / (truePositives + falsePositives)).toFixed(4))
      : null;

  const recall =
    truePositives + falseNegatives > 0
      ? Number((truePositives / (truePositives + falseNegatives)).toFixed(4))
      : null;

  const precisionDisplay =
    precision !== null
      ? `${(precision * 100).toFixed(1)}% (${truePositives}/${truePositives + falsePositives})`
      : expectedList.length === 0 && detectedList.length === 0
      ? '100.0% (0/0 — Zero False Positives)'
      : 'N/A (0 Detected)';

  const recallDisplay =
    recall !== null
      ? `${(recall * 100).toFixed(1)}% (${truePositives}/${truePositives + falseNegatives})`
      : expectedList.length === 0 && detectedList.length === 0
      ? '100.0% (0/0 — Zero Expected Events)'
      : 'N/A (0 Expected)';

  const f1Display =
    precision !== null && recall !== null && precision + recall > 0
      ? `${(((2 * precision * recall) / (precision + recall)) * 100).toFixed(1)}%`
      : expectedList.length === 0 && detectedList.length === 0
      ? '100.0%'
      : 'N/A';

  const rawOcc = analysisResult.gemini_raw.occupancy;
  const detOcc = analysisResult.deterministic_metrics;

  const makeOccDiff = (
    name: string,
    humanVal: number,
    geminiVal: number,
    engineVal: number
  ): OccupancyCalculationDiff => ({
    metric_name: name,
    human_ground_truth: humanVal,
    gemini_raw_output: geminiVal,
    deterministic_engine_output: engineVal,
    gemini_vs_human_delta: geminiVal - humanVal,
    engine_vs_human_delta: engineVal - humanVal,
    gemini_vs_engine_delta: geminiVal - engineVal,
    exact_engine_match: engineVal === humanVal,
  });

  const occupancyDifferences: OccupancyCalculationDiff[] = [
    makeOccDiff(
      'Current Occupancy',
      groundTruth.expected_current_occupancy,
      rawOcc.current_count,
      detOcc.current_count
    ),
    makeOccDiff(
      'Peak Occupancy',
      groundTruth.expected_peak_occupancy,
      rawOcc.peak_count,
      detOcc.peak_count
    ),
    makeOccDiff(
      'Confirmed Entries',
      groundTruth.expected_total_entries,
      rawOcc.total_entries,
      detOcc.total_entries
    ),
    makeOccDiff(
      'Confirmed Exits',
      groundTruth.expected_total_exits,
      rawOcc.total_exits,
      detOcc.total_exits
    ),
  ];

  const overallOccupancyExactMatch = occupancyDifferences.every(
    (d) => d.exact_engine_match
  );

  return {
    validation_id: `VAL-${Date.now().toString(36).toUpperCase()}`,
    evaluated_at_dar_es_salaam: formatDarEsSalaamTime(new Date(), true),
    analysis_id: analysisResult.analysis_id,
    video_filename: analysisResult.video_metadata.filename,
    human_ground_truth: groundTruth,
    expected_event_count: expectedList.length,
    detected_event_count: detectedList.length,
    true_positives: truePositives,
    false_positives: falsePositives,
    false_negatives: falseNegatives,
    event_precision: precision,
    event_precision_display: precisionDisplay,
    event_recall: recall,
    event_recall_display: recallDisplay,
    event_f1_display: f1Display,
    event_matches: eventMatches,
    occupancy_differences: occupancyDifferences,
    overall_occupancy_exact_match: overallOccupancyExactMatch,
    confidence_disclaimer:
      'Rule 7 Notice: Model-reported confidence values (including 100%) are internal LLM self-reported scores, NOT independently verified accuracy. Independent accuracy is measured strictly against human-verified ground truth.',
  };
}

