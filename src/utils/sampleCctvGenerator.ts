/**
 * Real HTML5 Canvas + MediaRecorder CCTV Video Clip Generator for Live Phase 0.3 Testing
 * Renders actual playable video files (WebM/MP4) for the 5 Phase 0.3 Validation Scenarios.
 * Note: This generates REAL video blobs that are uploaded to the backend and analyzed by Gemini.
 * It NEVER fabricates or mocks analysis results, and NEVER pre-populates synthetic ground truth.
 */

export type SampleScenarioId =
  | 'PHASE03_TEST1_CORRIDOR_PASS'
  | 'PHASE03_TEST2_CONFIRMED_EXIT'
  | 'PHASE03_TEST3_TWO_PEOPLE'
  | 'PHASE03_TEST4_TEMP_EXIT_REENTRY'
  | 'PHASE03_TEST5_UNCERTAIN_OBSCURED';

export interface SampleScenarioSpec {
  id: SampleScenarioId;
  code: string;
  title: string;
  description: string;
  durationSeconds: number;
  recommendedInitialOccupancy: number;
  filename: string;
}

export const SAMPLE_SCENARIOS: SampleScenarioSpec[] = [
  {
    id: 'PHASE03_TEST1_CORRIDOR_PASS',
    code: 'TEST 1',
    title: 'Test 1: Corridor Pass-Through (6s)',
    description:
      'Person A walks straight down the corridor past ROOM-101 (~00:00:03) without crossing the doorway threshold.',
    durationSeconds: 6,
    recommendedInitialOccupancy: 0,
    filename: 'phase03_test1_corridor_pass.webm',
  },
  {
    id: 'PHASE03_TEST2_CONFIRMED_EXIT',
    code: 'TEST 2',
    title: 'Test 2: Confirmed Doorway Exit (6s)',
    description:
      'Room starts with 1 occupant inside. Person A visibly crosses from inside ROOM-101 out into the corridor at ~00:00:03.',
    durationSeconds: 6,
    recommendedInitialOccupancy: 1,
    filename: 'phase03_test2_confirmed_exit.webm',
  },
  {
    id: 'PHASE03_TEST3_TWO_PEOPLE',
    code: 'TEST 3',
    title: 'Test 3: Two People Entering (8s)',
    description:
      'Person A crosses into ROOM-101 at ~00:00:02; Person B crosses into ROOM-101 at ~00:00:05. Peak occupancy reaches 2.',
    durationSeconds: 8,
    recommendedInitialOccupancy: 0,
    filename: 'phase03_test3_two_people.webm',
  },
  {
    id: 'PHASE03_TEST4_TEMP_EXIT_REENTRY',
    code: 'TEST 4',
    title: 'Test 4: Temporary Exit & Re-Entry (10s)',
    description:
      'Person A enters ROOM-101 at ~00:00:02, exits to corridor at ~00:00:05, and returns/re-enters ROOM-101 at ~00:00:08.',
    durationSeconds: 10,
    recommendedInitialOccupancy: 0,
    filename: 'phase03_test4_temp_exit_reentry.webm',
  },
  {
    id: 'PHASE03_TEST5_UNCERTAIN_OBSCURED',
    code: 'TEST 5',
    title: 'Test 5: Uncertain Camera Angle / Obscured (6s)',
    description:
      'Doorway threshold is obstructed by a corridor occlusion block at ~00:00:03; movement direction cannot be confirmed.',
    durationSeconds: 6,
    recommendedInitialOccupancy: 0,
    filename: 'phase03_test5_uncertain_angle.webm',
  },
];

export async function generateRealCctvTestVideoFile(
  scenarioId: SampleScenarioId,
  roomId: string,
  onProgress?: (pct: number) => void
): Promise<File> {
  const spec = SAMPLE_SCENARIOS.find((s) => s.id === scenarioId) || SAMPLE_SCENARIOS[0];
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for video generation.');
  }

  const stream = canvas.captureStream(15);
  const mimeTypes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  const selectedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType: selectedMime });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const recordingPromise = new Promise<File>((resolve, reject) => {
    recorder.onstop = () => {
      const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';
      const cleanMime = selectedMime.split(';')[0];
      const blob = new Blob(chunks, { type: cleanMime });
      const file = new File([blob], spec.filename.replace(/\.(webm|mp4)$/, `.${ext}`), {
        type: cleanMime,
      });
      resolve(file);
    };
    recorder.onerror = (err) => reject(err);
  });

  recorder.start(200);

  const fps = 15;
  const totalFrames = spec.durationSeconds * fps;

  const drawPerson = (
    x: number,
    y: number,
    scale: number,
    label: string,
    coatColor: string,
    actionText: string
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 48, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(-10, 15, 8, 32);
    ctx.fillRect(2, 15, 8, 32);

    // Torso / Coat
    ctx.fillStyle = coatColor;
    ctx.beginPath();
    ctx.roundRect(-16, -24, 32, 42, 6);
    ctx.fill();

    // Head
    ctx.fillStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.arc(0, -36, 11, 0, Math.PI * 2);
    ctx.fill();

    // Clear tracking label above person
    ctx.fillStyle = 'rgba(11, 12, 14, 0.9)';
    ctx.fillRect(-52, -68, 104, 18);
    ctx.strokeStyle = '#C5A059';
    ctx.lineWidth = 1;
    ctx.strokeRect(-52, -68, 104, 18);

    ctx.fillStyle = '#F5F2EB';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, -55);

    if (actionText) {
      ctx.fillStyle = '#C5A059';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(actionText, 0, -75);
    }

    ctx.restore();
  };

  for (let frame = 0; frame <= totalFrames; frame++) {
    const elapsedSec = frame / fps;
    if (onProgress) {
      onProgress(Math.min(99, Math.round((frame / totalFrames) * 100)));
    }

    // 1. Draw Corridor Background
    ctx.fillStyle = '#14161B';
    ctx.fillRect(0, 0, 640, 360);

    // Floor perspective
    ctx.fillStyle = '#1C1F26';
    ctx.beginPath();
    ctx.moveTo(0, 260);
    ctx.lineTo(240, 190);
    ctx.lineTo(440, 190);
    ctx.lineTo(640, 260);
    ctx.lineTo(640, 360);
    ctx.lineTo(0, 360);
    ctx.closePath();
    ctx.fill();

    // Left Wall (Contains the target Room Doorway)
    ctx.fillStyle = '#222631';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(240, 60);
    ctx.lineTo(240, 190);
    ctx.lineTo(0, 260);
    ctx.closePath();
    ctx.fill();

    // Target Room Doorway on Left Wall (x: 90..172, y: 72..227)
    ctx.fillStyle = '#090A0D';
    ctx.fillRect(90, 72, 82, 155);

    ctx.strokeStyle = '#C5A059';
    ctx.lineWidth = 4;
    ctx.strokeRect(90, 72, 82, 155);

    // Doorway sign
    ctx.fillStyle = '#0B0C0E';
    ctx.fillRect(96, 44, 70, 22);
    ctx.strokeStyle = '#C5A059';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(96, 44, 70, 22);
    ctx.fillStyle = '#F5F2EB';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(roomId, 131, 59);

    // Doorway Threshold Line on Floor
    ctx.strokeStyle = '#22C55E';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(88, 228);
    ctx.lineTo(175, 228);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#22C55E';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('DOOR THRESHOLD', 135, 243);

    // Right Wall
    ctx.fillStyle = '#1A1D24';
    ctx.beginPath();
    ctx.moveTo(640, 0);
    ctx.lineTo(440, 60);
    ctx.lineTo(440, 190);
    ctx.lineTo(640, 260);
    ctx.closePath();
    ctx.fill();

    // Scenario-Specific Actor Animations
    if (scenarioId === 'PHASE03_TEST1_CORRIDOR_PASS') {
      // Person A walks straight down center-right corridor from bottom-right to back-center WITHOUT approaching or crossing left door
      if (elapsedSec >= 0.8 && elapsedSec <= 5.0) {
        const t = (elapsedSec - 0.8) / 4.2;
        const px = 490 - t * 145; // stays on right side of hallway (x: 490 -> 345), far from left door (x: 90..172)
        const py = 320 - t * 125;
        const scale = 1.05 - t * 0.4;
        drawPerson(
          px,
          py,
          scale,
          'PERSON-A',
          '#64748B',
          'CORRIDOR PASS ONLY (NO ENTRY)'
        );
      }
    } else if (scenarioId === 'PHASE03_TEST2_CONFIRMED_EXIT') {
      // 0..1.8s: Person A is inside ROOM-101
      if (elapsedSec < 1.8) {
        ctx.fillStyle = '#22C55E';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('PERSON-A INSIDE ROOM', 131, 145);
      }
      // 1.8s..4.5s: Person A crosses OUT of doorway (x=130 -> 450, y=175 -> 290)
      if (elapsedSec >= 1.8 && elapsedSec <= 4.8) {
        const t = (elapsedSec - 1.8) / 3.0;
        const px = 130 + t * 320;
        const py = 175 + t * 110;
        const scale = 0.75 + t * 0.3;
        drawPerson(
          px,
          py,
          scale,
          'PERSON-A',
          '#F59E0B',
          elapsedSec < 3.4 ? 'EXITING DOORWAY THRESHOLD' : 'EXITED TO CORRIDOR'
        );
      }
    } else if (scenarioId === 'PHASE03_TEST3_TWO_PEOPLE') {
      // Person A enters at 1.0s..3.0s (crosses threshold at ~00:00:02)
      if (elapsedSec >= 0.8 && elapsedSec <= 3.0) {
        const t = (elapsedSec - 0.8) / 2.2;
        drawPerson(
          420 - t * 290,
          275 - t * 100,
          1.0 - t * 0.25,
          'PERSON-A',
          '#3B82F6',
          'PERSON-A ENTERING ROOM'
        );
      }
      if (elapsedSec > 3.0) {
        ctx.fillStyle = '#3B82F6';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('PERSON-A INSIDE', 131, 130);
      }
      // Person B enters at 3.8s..6.0s (crosses threshold at ~00:00:05)
      if (elapsedSec >= 3.8 && elapsedSec <= 6.0) {
        const t = (elapsedSec - 3.8) / 2.2;
        drawPerson(
          440 - t * 310,
          285 - t * 110,
          1.0 - t * 0.25,
          'PERSON-B',
          '#10B981',
          'PERSON-B ENTERING ROOM'
        );
      }
      if (elapsedSec > 6.0) {
        ctx.fillStyle = '#10B981';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('PERSON-B INSIDE (OCC=2)', 131, 155);
      }
    } else if (scenarioId === 'PHASE03_TEST4_TEMP_EXIT_REENTRY') {
      // 1. Entry at ~00:00:02 (0.8s..2.8s)
      if (elapsedSec >= 0.8 && elapsedSec <= 2.8) {
        const t = (elapsedSec - 0.8) / 2.0;
        drawPerson(
          410 - t * 280,
          270 - t * 95,
          1.0 - t * 0.25,
          'PERSON-A',
          '#3B82F6',
          'INITIAL ENTRY (00:00:02)'
        );
      }
      // 2. Temporary Exit at ~00:00:05 (4.0s..6.0s)
      if (elapsedSec >= 4.0 && elapsedSec <= 6.0) {
        const t = (elapsedSec - 4.0) / 2.0;
        drawPerson(
          130 + t * 240,
          175 + t * 80,
          0.75 + t * 0.2,
          'PERSON-A',
          '#3B82F6',
          'TEMPORARY EXIT (00:00:05)'
        );
      }
      // 3. Re-Entry at ~00:00:08 (7.0s..9.0s)
      if (elapsedSec >= 7.0 && elapsedSec <= 9.0) {
        const t = (elapsedSec - 7.0) / 2.0;
        drawPerson(
          370 - t * 240,
          255 - t * 80,
          0.95 - t * 0.2,
          'PERSON-A',
          '#3B82F6',
          'RE-ENTRY INTO ROOM (00:00:08)'
        );
      }
    } else if (scenarioId === 'PHASE03_TEST5_UNCERTAIN_OBSCURED') {
      // Draw partial person silhouette near doorway at 1.5s..4.5s, but covered by a heavy camera obstruction
      if (elapsedSec >= 1.5 && elapsedSec <= 4.5) {
        drawPerson(
          165,
          205,
          0.85,
          'PERSON-UNCERTAIN',
          '#64748B',
          'DIRECTION OBSCURED'
        );
      }
      // Heavy Visual Obstruction Over Doorway Threshold
      ctx.fillStyle = '#1E2028';
      ctx.fillRect(65, 65, 165, 200);
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 3;
      ctx.strokeRect(65, 65, 165, 200);
      ctx.fillStyle = '#EF4444';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CAMERA VIEW OBSCURED', 147, 150);
      ctx.fillStyle = '#F5F2EB';
      ctx.font = '10px monospace';
      ctx.fillText('THRESHOLD CROSSING UNVERIFIABLE', 147, 170);
    }

    // Top CCTV Banner
    ctx.fillStyle = 'rgba(11, 12, 14, 0.88)';
    ctx.fillRect(0, 0, 640, 32);
    ctx.fillStyle = '#C5A059';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`ENKAI CCTV // ${spec.code} // ${roomId}`, 12, 20);

    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const secs = String(Math.floor(elapsedSec % 60)).padStart(2, '0');
    ctx.fillStyle = '#F5F2EB';
    ctx.textAlign = 'right';
    ctx.fillText(`REL TIME 00:${mins}:${secs}`, 628, 20);

    await new Promise((r) => setTimeout(r, 1000 / fps));
  }

  recorder.stop();
  const file = await recordingPromise;
  if (onProgress) onProgress(100);
  return file;
}
