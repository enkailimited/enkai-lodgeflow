import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Calculator,
  Download,
  Clock,
  ShieldAlert,
  BookmarkCheck,
} from 'lucide-react';
import {
  AccuracyValidationReport,
  EventType,
  FullAnalysisResult,
  HumanGroundTruthEvent,
  HumanGroundTruthSpec,
  Phase03ExecutedTestRecord,
} from '../types/lodgeflow';
import {
  computeAccuracyValidationReport,
  formatDarEsSalaamTime,
  formatSecondsToVideoTimestamp,
} from '../engine/occupancyEngine';
import { Button } from './ui/Button';
import { FormField, Input, Select } from './ui/FormControls';
import { StatusBadge, EmptyState } from './ui/StatusComponents';
import { SectionHeader } from './ui/DataPresentation';

interface AccuracyValidationPanelProps {
  analysisResult: FullAnalysisResult | null;
  currentVideoPlayheadSec: number;
  executedTests: Phase03ExecutedTestRecord[];
  onSaveExecutedTest: (record: Phase03ExecutedTestRecord) => void;
}

export const AccuracyValidationPanel: React.FC<AccuracyValidationPanelProps> = ({
  analysisResult,
  currentVideoPlayheadSec,
  executedTests,
  onSaveExecutedTest,
}) => {
  const [operatorName, setOperatorName] = useState<string>('QA Validation Operator');
  const [toleranceSec, setToleranceSec] = useState<number>(3);
  const [expectedInitialOcc, setExpectedInitialOcc] = useState<number>(0);
  const [expectedCurrentOcc, setExpectedCurrentOcc] = useState<number>(0);
  const [expectedPeakOcc, setExpectedPeakOcc] = useState<number>(0);
  const [expectedTotalEntries, setExpectedTotalEntries] = useState<number>(0);
  const [expectedTotalExits, setExpectedTotalExits] = useState<number>(0);

  const [expectedEvents, setExpectedEvents] = useState<HumanGroundTruthEvent[]>([]);

  // New event draft form state
  const [draftPersonId, setDraftPersonId] = useState<string>('PERSON-A');
  const [draftEventType, setDraftEventType] = useState<EventType>('ENTRY');
  const [draftTimestamp, setDraftTimestamp] = useState<string>('00:00:02');
  const [draftNotes, setDraftNotes] = useState<string>('');

  // Computed accuracy report (ONLY populated when operator explicitly clicks Evaluate)
  const [validationReport, setValidationReport] = useState<AccuracyValidationReport | null>(
    null
  );
  const [testTitleInput, setTestTitleInput] = useState<string>('Phase 0.3 Video Test');

  const handleAddExpectedEvent = () => {
    const newEv: HumanGroundTruthEvent = {
      expected_id: `EXP-${String(expectedEvents.length + 1).padStart(3, '0')}`,
      person_id: draftPersonId.trim().toUpperCase() || 'ANY',
      event_type: draftEventType,
      video_timestamp: draftTimestamp.trim() || '00:00:00',
      notes: draftNotes.trim() || undefined,
    };
    setExpectedEvents((prev) => [...prev, newEv]);
    setValidationReport(null);
  };

  const handleRemoveExpectedEvent = (id: string) => {
    setExpectedEvents((prev) => prev.filter((e) => e.expected_id !== id));
    setValidationReport(null);
  };

  const handleClearGroundTruth = () => {
    setExpectedEvents([]);
    setExpectedInitialOcc(0);
    setExpectedCurrentOcc(0);
    setExpectedPeakOcc(0);
    setExpectedTotalEntries(0);
    setExpectedTotalExits(0);
    setValidationReport(null);
  };

  const handleLoadTestTemplate = (testNumber: 1 | 2 | 3 | 4 | 5 | 0) => {
    setValidationReport(null);
    if (testNumber === 0) {
      setTestTitleInput('Baseline Clip — Single Entry at 00:00:05');
      setExpectedInitialOcc(0);
      setExpectedCurrentOcc(1);
      setExpectedPeakOcc(1);
      setExpectedTotalEntries(1);
      setExpectedTotalExits(0);
      setExpectedEvents([
        {
          expected_id: 'EXP-001',
          person_id: 'PERSON-A',
          event_type: 'ENTRY',
          video_timestamp: '00:00:05',
          notes: 'Person A crosses doorway into ROOM-101',
        },
      ]);
    } else if (testNumber === 1) {
      setTestTitleInput('TEST 1 — Corridor Pass-Through');
      setExpectedInitialOcc(0);
      setExpectedCurrentOcc(0);
      setExpectedPeakOcc(0);
      setExpectedTotalEntries(0);
      setExpectedTotalExits(0);
      setExpectedEvents([
        {
          expected_id: 'EXP-001',
          person_id: 'PERSON-A',
          event_type: 'CORRIDOR_PASS',
          video_timestamp: '00:00:03',
          notes: 'Walks past room entrance without entering',
        },
      ]);
    } else if (testNumber === 2) {
      setTestTitleInput('TEST 2 — Confirmed Exit');
      setExpectedInitialOcc(1);
      setExpectedCurrentOcc(0);
      setExpectedPeakOcc(1);
      setExpectedTotalEntries(0);
      setExpectedTotalExits(1);
      setExpectedEvents([
        {
          expected_id: 'EXP-001',
          person_id: 'PERSON-A',
          event_type: 'EXIT',
          video_timestamp: '00:00:03',
          notes: 'Occupant crosses from inside room out to corridor',
        },
      ]);
    } else if (testNumber === 3) {
      setTestTitleInput('TEST 3 — Two People Entering');
      setExpectedInitialOcc(0);
      setExpectedCurrentOcc(2);
      setExpectedPeakOcc(2);
      setExpectedTotalEntries(2);
      setExpectedTotalExits(0);
      setExpectedEvents([
        {
          expected_id: 'EXP-001',
          person_id: 'PERSON-A',
          event_type: 'ENTRY',
          video_timestamp: '00:00:02',
          notes: 'First person enters room',
        },
        {
          expected_id: 'EXP-002',
          person_id: 'PERSON-B',
          event_type: 'ENTRY',
          video_timestamp: '00:00:05',
          notes: 'Second person enters room',
        },
      ]);
    } else if (testNumber === 4) {
      setTestTitleInput('TEST 4 — Temporary Exit and Re-Entry');
      setExpectedInitialOcc(0);
      setExpectedCurrentOcc(1);
      setExpectedPeakOcc(1);
      setExpectedTotalEntries(2);
      setExpectedTotalExits(1);
      setExpectedEvents([
        {
          expected_id: 'EXP-001',
          person_id: 'PERSON-A',
          event_type: 'ENTRY',
          video_timestamp: '00:00:02',
          notes: 'Initial confirmed entry',
        },
        {
          expected_id: 'EXP-002',
          person_id: 'PERSON-A',
          event_type: 'EXIT',
          video_timestamp: '00:00:05',
          notes: 'Temporary exit to corridor',
        },
        {
          expected_id: 'EXP-003',
          person_id: 'PERSON-A',
          event_type: 'RE_ENTRY',
          video_timestamp: '00:00:08',
          notes: 'Re-entry into doorway',
        },
      ]);
    } else if (testNumber === 5) {
      setTestTitleInput('TEST 5 — Uncertain Camera Angle / Obscured');
      setExpectedInitialOcc(0);
      setExpectedCurrentOcc(0);
      setExpectedPeakOcc(0);
      setExpectedTotalEntries(0);
      setExpectedTotalExits(0);
      setExpectedEvents([
        {
          expected_id: 'EXP-001',
          person_id: 'ANY',
          event_type: 'UNKNOWN',
          video_timestamp: '00:00:03',
          notes: 'Doorway crossing obscured; no automatic occupancy change',
        },
      ]);
    }
  };

  const handleEvaluateAccuracy = () => {
    if (!analysisResult) return;
    const spec: HumanGroundTruthSpec = {
      recorded_by_operator: operatorName.trim() || 'Operator',
      recorded_at_dar_es_salaam: formatDarEsSalaamTime(new Date(), true),
      timestamp_tolerance_seconds: Math.max(0, toleranceSec),
      expected_initial_occupancy: expectedInitialOcc,
      expected_current_occupancy: expectedCurrentOcc,
      expected_peak_occupancy: expectedPeakOcc,
      expected_total_entries: expectedTotalEntries,
      expected_total_exits: expectedTotalExits,
      expected_events: expectedEvents,
    };

    const report = computeAccuracyValidationReport(analysisResult, spec);
    setValidationReport(report);
  };

  const handleSaveCurrentTestRecord = () => {
    if (!analysisResult || !validationReport) return;
    const record: Phase03ExecutedTestRecord = {
      test_id: `TEST-${String(executedTests.length + 1).padStart(2, '0')}-${Date.now()
        .toString(36)
        .slice(-4)
        .toUpperCase()}`,
      test_title: testTitleInput.trim() || `Clip: ${analysisResult.video_metadata.filename}`,
      executed_at_dar_es_salaam: formatDarEsSalaamTime(new Date(), true),
      video_filename: analysisResult.video_metadata.filename,
      video_duration_seconds: analysisResult.gemini_raw.video_duration_seconds,
      model_used: analysisResult.model_used,
      gemini_raw_output: analysisResult.gemini_raw,
      deterministic_engine_output: analysisResult.deterministic_metrics,
      human_ground_truth: validationReport.human_ground_truth,
      accuracy_report: validationReport,
    };
    onSaveExecutedTest(record);
  };

  const handleExportValidationJson = () => {
    if (!validationReport || !analysisResult) return;
    const payload = {
      phase: 'ENKAI LODGEFLOW — PHASE 0.3 ACCURACY VALIDATION REPORT',
      exported_at_dar_es_salaam: formatDarEsSalaamTime(new Date(), true),
      gemini_model_output: analysisResult.gemini_raw,
      deterministic_occupancy_engine_output: analysisResult.deterministic_metrics,
      human_verified_ground_truth: validationReport.human_ground_truth,
      independently_measured_accuracy: validationReport,
      executed_test_suite_log: executedTests,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enkai-phase03-accuracy-report-${validationReport.validation_id.toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-[#E1EAF5] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E1EAF5] pb-4">
        <div>
          <StatusBadge label="Phase 0.3 · Independent Ground-Truth Verification" tone="info" />
          <h2 className="text-lg sm:text-xl font-extrabold text-[#082B59] mt-1.5">
            CCTV Entry/Exit Accuracy Validation Report
          </h2>
          <p className="text-xs sm:text-sm text-[#718096] mt-0.5 max-w-2xl">
            Record human-verified expected events and occupancy for any uploaded CCTV clip, then compare against Gemini model output and deterministic engine results. Accuracy is never calculated from synthetic or assumed ground truth.
          </p>
        </div>

        {/* Rule 7 Notice */}
        <div className="p-3.5 bg-[#EAF3FF]/70 border border-[#1769E8]/25 rounded-xl max-w-md text-xs text-[#152B4A] flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-[#1769E8] shrink-0 mt-0.5" />
          <div>
            <strong className="text-[#082B59]">Rule 7 Confidence Notice:</strong> 100% (or any) Gemini confidence is a model-reported score, not independently verified accuracy. Independent precision and recall require human ground truth below.
          </div>
        </div>
      </div>

      {/* Step 1 & Step 2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Step 1: Operator Ground Truth Entry Form */}
        <div className="lg:col-span-6 space-y-4 bg-[#F5F8FD] border border-[#E1EAF5] rounded-2xl p-4 sm:p-5">
          <SectionHeader
            title="1. Human-Verified Ground Truth Input"
            icon={<Calculator className="w-4 h-4" />}
            rightContent={
              <Button variant="ghost" size="sm" onClick={handleClearGroundTruth}>
                Clear Ground Truth
              </Button>
            }
          />

          {/* Quick-Fill Presets for Standard Phase 0.3 Test Scenarios */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-[#718096]">
              Quick-populate operator ground truth form for a standard Phase 0.3 test scenario:
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleLoadTestTemplate(0)}
                className="!h-7 !px-2.5 !text-[11px]"
              >
                Baseline (1 Entry @ 00:05)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLoadTestTemplate(1)}
                className="!h-7 !px-2.5 !text-[11px]"
              >
                Test 1: Corridor Pass
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLoadTestTemplate(2)}
                className="!h-7 !px-2.5 !text-[11px]"
              >
                Test 2: Confirmed Exit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLoadTestTemplate(3)}
                className="!h-7 !px-2.5 !text-[11px]"
              >
                Test 3: Two People
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLoadTestTemplate(4)}
                className="!h-7 !px-2.5 !text-[11px]"
              >
                Test 4: Exit &amp; Re-Entry
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLoadTestTemplate(5)}
                className="!h-7 !px-2.5 !text-[11px]"
              >
                Test 5: Uncertain Angle
              </Button>
            </div>
          </div>

          {/* Expected Occupancy Metrics Inputs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <FormField label="Test / Clip Label">
              <Input
                type="text"
                value={testTitleInput}
                onChange={(e) => setTestTitleInput(e.target.value)}
              />
            </FormField>
            <FormField label="Verified By Operator">
              <Input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
              />
            </FormField>
            <FormField label="Timestamp Tolerance (±s)">
              <Input
                type="number"
                mono
                min={0}
                max={15}
                value={toleranceSec}
                onChange={(e) => setToleranceSec(Math.max(0, Number(e.target.value) || 0))}
              />
            </FormField>

            <FormField label="Expected Final Occupancy">
              <Input
                type="number"
                mono
                min={0}
                value={expectedCurrentOcc}
                onChange={(e) => {
                  setExpectedCurrentOcc(Math.max(0, Number(e.target.value) || 0));
                  setValidationReport(null);
                }}
              />
            </FormField>
            <FormField label="Expected Peak Occupancy">
              <Input
                type="number"
                mono
                min={0}
                value={expectedPeakOcc}
                onChange={(e) => {
                  setExpectedPeakOcc(Math.max(0, Number(e.target.value) || 0));
                  setValidationReport(null);
                }}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Exp. Entries">
                <Input
                  type="number"
                  mono
                  min={0}
                  value={expectedTotalEntries}
                  onChange={(e) => {
                    setExpectedTotalEntries(Math.max(0, Number(e.target.value) || 0));
                    setValidationReport(null);
                  }}
                />
              </FormField>
              <FormField label="Exp. Exits">
                <Input
                  type="number"
                  mono
                  min={0}
                  value={expectedTotalExits}
                  onChange={(e) => {
                    setExpectedTotalExits(Math.max(0, Number(e.target.value) || 0));
                    setValidationReport(null);
                  }}
                />
              </FormField>
            </div>
          </div>

          {/* Add Expected Event Row */}
          <div className="p-3.5 bg-white border border-[#E1EAF5] rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#082B59]">
                Add Human-Observed Ground Truth Event
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDraftTimestamp(formatSecondsToVideoTimestamp(currentVideoPlayheadSec))
                }
                icon={<Clock className="w-3.5 h-3.5 text-[#1769E8]" />}
                className="!h-7 !px-2 !text-[11px] font-mono"
              >
                Use Playhead ({formatSecondsToVideoTimestamp(currentVideoPlayheadSec)})
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <Select
                value={draftEventType}
                onChange={(e) => setDraftEventType(e.target.value as EventType)}
              >
                <option value="ENTRY">ENTRY</option>
                <option value="EXIT">EXIT</option>
                <option value="RE_ENTRY">RE_ENTRY</option>
                <option value="CORRIDOR_PASS">CORRIDOR_PASS</option>
                <option value="UNKNOWN">UNKNOWN</option>
              </Select>

              <Input
                type="text"
                mono
                placeholder="PERSON-A or ANY"
                value={draftPersonId}
                onChange={(e) => setDraftPersonId(e.target.value)}
              />

              <Input
                type="text"
                mono
                placeholder="00:00:05"
                value={draftTimestamp}
                onChange={(e) => setDraftTimestamp(e.target.value)}
              />

              <Button
                variant="primary"
                size="md"
                onClick={handleAddExpectedEvent}
                icon={<Plus className="w-3.5 h-3.5" />}
                className="!h-9"
              >
                Add Event
              </Button>
            </div>
          </div>

          {/* Recorded Expected Events List */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-[#152B4A]">
              Recorded Ground Truth Events ({expectedEvents.length})
            </div>
            {expectedEvents.length === 0 ? (
              <div className="p-3 bg-white border border-[#E1EAF5] rounded-xl text-xs text-[#718096]">
                No expected events added (0 expected events). Add events above or click Evaluate if 0 doorway events are expected.
              </div>
            ) : (
              <div className="max-h-[160px] overflow-y-auto divide-y divide-[#E1EAF5] border border-[#E1EAF5] rounded-xl bg-white">
                {expectedEvents.map((ev) => (
                  <div
                    key={ev.expected_id}
                    className="px-3 py-2 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[#1769E8] font-bold">{ev.video_timestamp}</span>
                      <span>·</span>
                      <span className="text-[#152B4A] font-bold">{ev.event_type}</span>
                      <span>·</span>
                      <span className="text-[#718096]">{ev.person_id}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveExpectedEvent(ev.expected_id)}
                      className="!h-7 !px-2 !text-[#EF4444] hover:!bg-[#FEF2F2]"
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button
            variant="primary"
            size="md"
            fullWidth
            disabled={!analysisResult}
            onClick={handleEvaluateAccuracy}
            icon={<Calculator className="w-4 h-4" />}
          >
            {analysisResult
              ? `Compare Ground Truth vs Gemini Result (${analysisResult.video_metadata.filename})`
              : 'Analyze a CCTV Video Clip First to Compute Accuracy'}
          </Button>
        </div>

        {/* Step 2: Independently Measured Accuracy & 4-Way Separated Output */}
        <div className="lg:col-span-6 space-y-4 bg-[#F5F8FD] border border-[#E1EAF5] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          {!validationReport || !analysisResult ? (
            <div className="my-auto">
              <EmptyState
                icon={<Calculator className="w-6 h-6" />}
                title="Awaiting Human-Verified Ground Truth Evaluation"
                description="Per Phase 0.3 requirements, accuracy metrics (Precision, Recall, TP, FP, FN, and Occupancy Differences) are never calculated from synthetic or assumed ground truth. Record your human-verified observations on the left and click Compare Ground Truth vs Gemini Result."
              />
            </div>
          ) : (
            <div className="space-y-4">
              <SectionHeader
                title="2. Independently Measured Accuracy Metrics"
                subtitle={`Validation ID: ${validationReport.validation_id} · Clip: ${validationReport.video_filename}`}
                rightContent={
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveCurrentTestRecord}
                      icon={<BookmarkCheck className="w-3.5 h-3.5 text-[#1769E8]" />}
                    >
                      Log Test Result
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleExportValidationJson}
                      icon={<Download className="w-3.5 h-3.5" />}
                    >
                      Export JSON
                    </Button>
                  </div>
                }
              />

              {/* Precision, Recall, TP, FP, FN Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 font-mono tabular-nums">
                <div className="p-3 bg-white border border-[#E1EAF5] rounded-xl">
                  <div className="text-[11px] text-[#718096] font-sans font-medium">
                    True Positives
                  </div>
                  <div className="text-lg font-extrabold text-[#12B981]">
                    {validationReport.true_positives}
                  </div>
                  <div className="text-[10px] text-[#718096]">
                    Exp: {validationReport.expected_event_count}
                  </div>
                </div>

                <div className="p-3 bg-white border border-[#E1EAF5] rounded-xl">
                  <div className="text-[11px] text-[#718096] font-sans font-medium">
                    False Positives
                  </div>
                  <div className="text-lg font-extrabold text-[#EF4444]">
                    {validationReport.false_positives}
                  </div>
                  <div className="text-[10px] text-[#718096]">
                    Det: {validationReport.detected_event_count}
                  </div>
                </div>

                <div className="p-3 bg-white border border-[#E1EAF5] rounded-xl">
                  <div className="text-[11px] text-[#718096] font-sans font-medium">
                    False Negatives
                  </div>
                  <div className="text-lg font-extrabold text-[#F5A623]">
                    {validationReport.false_negatives}
                  </div>
                  <div className="text-[10px] text-[#718096]">Missed events</div>
                </div>

                <div className="p-3 bg-white border border-[#E1EAF5] rounded-xl">
                  <div className="text-[11px] text-[#718096] font-sans font-medium">
                    Event Precision
                  </div>
                  <div className="text-sm font-extrabold text-[#082B59] mt-1">
                    {validationReport.event_precision_display}
                  </div>
                </div>

                <div className="p-3 bg-white border border-[#E1EAF5] rounded-xl">
                  <div className="text-[11px] text-[#718096] font-sans font-medium">
                    Event Recall
                  </div>
                  <div className="text-sm font-extrabold text-[#082B59] mt-1">
                    {validationReport.event_recall_display}
                  </div>
                </div>
              </div>

              {/* Occupancy Calculation Differences Table */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[#152B4A]">
                  Occupancy Calculation Comparison (Human GT vs Gemini vs Deterministic Engine)
                </div>
                <div className="overflow-x-auto border border-[#E1EAF5] rounded-xl bg-white">
                  <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                    <thead>
                      <tr className="bg-[#F5F8FD] text-[#152B4A] border-b border-[#E1EAF5] font-sans">
                        <th className="py-2 px-3 font-bold">Metric</th>
                        <th className="py-2 px-3 text-right font-bold">Human GT</th>
                        <th className="py-2 px-3 text-right font-bold">Gemini Raw</th>
                        <th className="py-2 px-3 text-right font-bold">Engine Output</th>
                        <th className="py-2 px-3 text-right font-bold">Engine Δ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E1EAF5]">
                      {validationReport.occupancy_differences.map((diff) => (
                        <tr key={diff.metric_name}>
                          <td className="py-2 px-3 font-sans font-medium text-[#152B4A]">
                            {diff.metric_name}
                          </td>
                          <td className="py-2 px-3 text-right text-[#152B4A]">
                            {diff.human_ground_truth}
                          </td>
                          <td className="py-2 px-3 text-right text-[#718096]">
                            {diff.gemini_raw_output}
                          </td>
                          <td className="py-2 px-3 text-right text-[#1769E8] font-bold">
                            {diff.deterministic_engine_output}
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-bold ${
                              diff.exact_engine_match ? 'text-[#12B981]' : 'text-[#EF4444]'
                            }`}
                          >
                            {diff.engine_vs_human_delta === 0
                              ? '0 (EXACT)'
                              : diff.engine_vs_human_delta > 0
                              ? `+${diff.engine_vs_human_delta}`
                              : diff.engine_vs_human_delta}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Event-by-Event TP / FP / FN Breakdown */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[#152B4A]">
                  Event Matching Breakdown ({validationReport.event_matches.length})
                </div>
                <div className="max-h-[150px] overflow-y-auto space-y-1.5 pr-1">
                  {validationReport.event_matches.map((m, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-white border border-[#E1EAF5] rounded-xl text-xs flex items-start justify-between gap-2"
                    >
                      <div>
                        <span
                          className={`font-mono font-bold mr-2 ${
                            m.match_type === 'TRUE_POSITIVE'
                              ? 'text-[#12B981]'
                              : m.match_type === 'FALSE_POSITIVE'
                              ? 'text-[#EF4444]'
                              : 'text-[#F5A623]'
                          }`}
                        >
                          [{m.match_type}]
                        </span>
                        <span className="text-[#152B4A]">{m.explanation}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Logged Phase 0.3 Executed Video Tests */}
      {executedTests.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-[#E1EAF5]">
          <h3 className="text-sm font-bold text-[#082B59]">
            Executed Phase 0.3 Video Test Log ({executedTests.length} Validated Runs)
          </h3>
          <div className="overflow-x-auto border border-[#E1EAF5] rounded-xl bg-white">
            <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
              <thead>
                <tr className="bg-[#F5F8FD] text-[#152B4A] border-b border-[#E1EAF5] font-sans">
                  <th className="py-2.5 px-3 font-bold">Test ID &amp; Title</th>
                  <th className="py-2.5 px-3 font-bold">Video File</th>
                  <th className="py-2.5 px-3 font-bold">Human GT (Occ / Ent / Ex)</th>
                  <th className="py-2.5 px-3 font-bold">Gemini Raw (Occ / Ent / Ex)</th>
                  <th className="py-2.5 px-3 font-bold">Engine (Occ / Ent / Ex)</th>
                  <th className="py-2.5 px-3 font-bold">TP / FP / FN</th>
                  <th className="py-2.5 px-3 font-bold">Precision / Recall</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1EAF5]">
                {executedTests.map((t) => (
                  <tr key={t.test_id} className="hover:bg-[#F5F8FD]">
                    <td className="py-2 px-3 font-sans">
                      <div className="text-[#152B4A] font-bold">{t.test_title}</div>
                      <div className="text-[10px] text-[#718096] font-mono">
                        {t.test_id} · {t.model_used}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-[#718096]">
                      {t.video_filename} ({t.video_duration_seconds}s)
                    </td>
                    <td className="py-2 px-3 text-[#152B4A]">
                      {t.human_ground_truth.expected_current_occupancy} /{' '}
                      {t.human_ground_truth.expected_total_entries} /{' '}
                      {t.human_ground_truth.expected_total_exits}
                    </td>
                    <td className="py-2 px-3 text-[#718096]">
                      {t.gemini_raw_output.occupancy.current_count} /{' '}
                      {t.gemini_raw_output.occupancy.total_entries} /{' '}
                      {t.gemini_raw_output.occupancy.total_exits}
                    </td>
                    <td className="py-2 px-3 text-[#1769E8] font-bold">
                      {t.deterministic_engine_output.current_count} /{' '}
                      {t.deterministic_engine_output.total_entries} /{' '}
                      {t.deterministic_engine_output.total_exits}
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-[#12B981] font-bold">
                        {t.accuracy_report.true_positives}
                      </span>{' '}
                      /{' '}
                      <span className="text-[#EF4444] font-bold">
                        {t.accuracy_report.false_positives}
                      </span>{' '}
                      /{' '}
                      <span className="text-[#F5A623] font-bold">
                        {t.accuracy_report.false_negatives}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[#082B59] font-bold">
                      P: {t.accuracy_report.event_precision_display.split(' ')[0]} · R:{' '}
                      {t.accuracy_report.event_recall_display.split(' ')[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
