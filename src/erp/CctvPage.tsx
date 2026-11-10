/**
 * CCTV intelligence module. Cameras, analysis jobs, alerts and the latest
 * deterministic occupancy evidence. CCTV informs staff; it never overwrites
 * reservations, check-in, finance or room handover.
 */

import { useState } from 'react';
import { Camera, ExternalLink, Plus, RefreshCw, ShieldAlert, Video } from 'lucide-react';
import { apiGet, apiPatch, apiPost, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from './useApi';
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, Page, dateTime } from './ui';
import { Button } from '../components/ui/Button';
import { StatCard } from '../components/ui/DataPresentation';
import { StatusBadge } from '../components/ui/StatusComponents';
import { Modal } from '../components/ui/Modal';
import { FormField, Input, Select } from '../components/ui/FormControls';
import type { Camera as CameraRow, CctvAlert, CctvSummary, AnalysisJob, OccupancyRoomState, Room } from './types';

export function CctvPage() {
  const { can } = useAuth();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', roomId: '', rtspUrl: '', mode: 'UPLOAD_PROTOTYPE' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [alertStatus, setAlertStatus] = useState('OPEN');

  const summary = useApi(() => apiGet<CctvSummary>('/api/cctv/summary'));
  const cameras = useApi(() => apiGet<{ cameras: CameraRow[] }>('/api/cctv/cameras'));
  const jobs = useApi(() => apiGet<{ jobs: AnalysisJob[] }>('/api/cctv/jobs'));
  const alerts = useApi(() => apiGet<{ alerts: CctvAlert[] }>(`/api/cctv/alerts?status=${alertStatus}`), [alertStatus]);
  const occupancy = useApi(() => apiGet<{ rooms: OccupancyRoomState[] }>('/api/occupancy/rooms'));
  const rooms = useApi(() => apiGet<{ rooms: Room[] }>('/api/rooms'));

  const canWrite = can('cctv.write');

  async function createCamera() {
    setSaving(true);
    setFormError(null);
    try {
      await apiPost('/api/cctv/cameras', {
        name: form.name,
        location: form.location || null,
        roomId: form.roomId || null,
        rtspUrl: form.rtspUrl || null,
        mode: form.mode,
      });
      setCameraOpen(false);
      setForm({ name: '', location: '', roomId: '', rtspUrl: '', mode: 'UPLOAD_PROTOTYPE' });
      setMessage({ tone: 'ok', text: 'Camera registered.' });
      cameras.reload();
      summary.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function acknowledge(alert: CctvAlert) {
    setMessage(null);
    try {
      await apiPost(`/api/cctv/alerts/${alert.id}/acknowledge`, {});
      setMessage({ tone: 'ok', text: 'Alert acknowledged. This does not change any room status.' });
      alerts.reload();
      summary.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }

  async function review(state: OccupancyRoomState, decision: 'CONFIRMED' | 'DISMISSED') {
    setMessage(null);
    try {
      await apiPatch(`/api/occupancy/states/${state.id}/review`, { decision });
      setMessage({ tone: 'ok', text: `Occupancy evidence ${decision.toLowerCase()} for room ${state.room_number}.` });
      occupancy.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }

  const cameraStatuses = summary.data?.cameras ?? {};
  const jobStatuses = summary.data?.analysisJobs ?? {};

  return (
    <Page
      title="CCTV intelligence"
      subtitle="Cameras, analysis evidence and occupancy verification — a supporting module, not an authority."
      actions={
        <div className="flex flex-wrap gap-2">
          <a
            href="/cctv"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E1EAF5] bg-white text-xs font-semibold text-[#152B4A] hover:border-[#1769E8]/50"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Analysis workspace
          </a>
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => { summary.reload(); cameras.reload(); jobs.reload(); alerts.reload(); occupancy.reload(); }}>
            Refresh
          </Button>
          {canWrite && (
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setFormError(null); setCameraOpen(true); }}>
              Register camera
            </Button>
          )}
        </div>
      }
    >
      {message && (
        <div className={`rounded-xl border px-4 py-2.5 text-xs ${message.tone === 'ok' ? 'border-[#12B981]/30 bg-[#12B981]/8 text-[#0D7A54]' : 'border-[#EF4444]/25 bg-[#EF4444]/5 text-[#B42318]'}`}>
          {message.text}
        </div>
      )}

      <div className="rounded-xl border border-[#1769E8]/20 bg-[#EAF3FF]/60 px-4 py-3 text-xs text-[#0B3E7A] flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          The deterministic occupancy engine remains authoritative for computed occupancy. CCTV evidence
          can request verification and raise alerts, but cannot check a guest in or out, change room
          status, or alter invoices.
        </p>
      </div>

      {summary.loading ? (
        <LoadingBlock />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Cameras" value={cameras.data?.cameras.length ?? 0} supportingText={Object.entries(cameraStatuses).map(([status, count]) => `${count} ${status}`).join(' · ') || 'None registered'} icon={<Camera className="w-5 h-5" />} iconTone="navy" />
          <StatCard label="Analysis jobs" value={jobs.data?.jobs.length ?? 0} supportingText={Object.entries(jobStatuses).map(([status, count]) => `${count} ${status}`).join(' · ') || 'No jobs yet'} icon={<Video className="w-5 h-5" />} iconTone="blue" />
          <StatCard label="Open alerts" value={summary.data?.openAlerts ?? 0} supportingText="Awaiting acknowledgement" icon={<ShieldAlert className="w-5 h-5" />} iconTone="amber" />
          <StatCard label="Rooms with evidence" value={occupancy.data?.rooms.length ?? 0} supportingText="Latest deterministic state per room" icon={<Camera className="w-5 h-5" />} iconTone="green" />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Cameras" subtitle="Registered devices for this business">
          {cameras.error ? (
            <ErrorBlock message={cameras.error} onRetry={cameras.reload} />
          ) : cameras.loading ? (
            <LoadingBlock />
          ) : (cameras.data?.cameras.length ?? 0) === 0 ? (
            <EmptyBlock title="No cameras registered" description="Register a camera and map it to a room to request occupancy verification at check-out." />
          ) : (
            <ul className="divide-y divide-[#E1EAF5] text-xs">
              {cameras.data?.cameras.map((camera) => (
                <li key={camera.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#152B4A]">{camera.name}</p>
                    <p className="text-[10px] text-[#8EA2BC]">
                      {camera.location ?? 'No location'}
                      {camera.room_number ? ` · room ${camera.room_number}` : ' · not mapped to a room'}
                      {camera.mode === 'RTSP' ? ' · RTSP' : ' · upload prototype'}
                    </p>
                  </div>
                  <StatusBadge label={camera.status} tone={camera.status === 'ONLINE' ? 'success' : camera.status === 'ERROR' ? 'danger' : 'neutral'} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Alerts"
          subtitle="Acknowledgement is recorded; it never mutates rooms"
          actions={<Select value={alertStatus} onChange={(e) => setAlertStatus(e.target.value)} options={['OPEN', 'ACKNOWLEDGED', 'DISMISSED'].map((value) => ({ value, label: value }))} className="w-36" />}
        >
          {alerts.error ? (
            <ErrorBlock message={alerts.error} onRetry={alerts.reload} />
          ) : alerts.loading ? (
            <LoadingBlock />
          ) : (alerts.data?.alerts.length ?? 0) === 0 ? (
            <EmptyBlock title="No alerts" description={`There are no ${alertStatus.toLowerCase()} CCTV alerts.`} />
          ) : (
            <ul className="divide-y divide-[#E1EAF5] text-xs">
              {alerts.data?.alerts.map((alert) => (
                <li key={alert.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#152B4A]">{alert.type.replace(/_/g, ' ')}</p>
                    <p className="text-[10px] text-[#8EA2BC]">
                      {alert.severity} · {dateTime(alert.created_at)}
                      {alert.camera_name ? ` · ${alert.camera_name}` : ''}
                      {alert.room_number ? ` · room ${alert.room_number}` : ''}
                    </p>
                    <p className="text-[11px] text-[#5B6B82] mt-0.5">{alert.message}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge label={alert.status} tone={alert.status === 'OPEN' ? 'warning' : 'neutral'} />
                    {canWrite && alert.status === 'OPEN' && (
                      <Button size="sm" variant="ghost" onClick={() => acknowledge(alert)}>Acknowledge</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Latest occupancy evidence" subtitle="Deterministic engine output with registered guest comparison">
        {occupancy.error ? (
          <ErrorBlock message={occupancy.error} onRetry={occupancy.reload} />
        ) : occupancy.loading ? (
          <LoadingBlock />
        ) : (occupancy.data?.rooms.length ?? 0) === 0 ? (
          <EmptyBlock title="No occupancy states yet" description="States appear after a video analysis run completes and stores its evidence." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-[#8EA2BC]">
                  <th className="py-2 pr-4">Room</th>
                  <th className="py-2 pr-4">Computed</th>
                  <th className="py-2 pr-4">Registered</th>
                  <th className="py-2 pr-4">Confidence</th>
                  <th className="py-2 pr-4">Lifecycle evidence</th>
                  <th className="py-2 pr-4">Captured</th>
                  <th className="py-2 text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1EAF5]">
                {occupancy.data?.rooms.map((state) => (
                  <tr key={state.id}>
                    <td className="py-2 pr-4 font-semibold text-[#152B4A]">Room {state.room_number}</td>
                    <td className="py-2 pr-4">{state.computed_count}</td>
                    <td className="py-2 pr-4">{state.registered_guest_count}</td>
                    <td className="py-2 pr-4">{state.confidence === null ? '—' : `${Math.round(state.confidence * 100)}%`}</td>
                    <td className="py-2 pr-4">{state.derived_lifecycle_state ?? '—'}</td>
                    <td className="py-2 pr-4">{dateTime(state.created_at)}</td>
                    <td className="py-2 text-right">
                      {state.requires_review && canWrite ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => review(state, 'CONFIRMED')}>Confirm</Button>
                          <Button size="sm" variant="ghost" onClick={() => review(state, 'DISMISSED')}>Dismiss</Button>
                        </div>
                      ) : state.requires_review ? (
                        <StatusBadge label="Needs review" tone="warning" />
                      ) : (
                        <StatusBadge label="Reviewed" tone="success" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Analysis jobs" subtitle="Uploaded footage processed by the existing Gemini pipeline">
        {jobs.error ? (
          <ErrorBlock message={jobs.error} onRetry={jobs.reload} />
        ) : jobs.loading ? (
          <LoadingBlock />
        ) : (jobs.data?.jobs.length ?? 0) === 0 ? (
          <EmptyBlock title="No analysis jobs" description="Open the analysis workspace to upload footage; completed jobs are stored here." />
        ) : (
          <ul className="divide-y divide-[#E1EAF5] text-xs">
            {jobs.data?.jobs.map((job) => (
              <li key={job.id} className="py-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#152B4A]">{job.filename ?? job.id}</p>
                  <p className="text-[10px] text-[#8EA2BC]">
                    {job.camera_name ?? 'No camera'} · {job.room_number ? `room ${job.room_number}` : 'no room'} · {dateTime(job.created_at)}
                  </p>
                </div>
                <StatusBadge label={job.status} tone={job.status === 'COMPLETED' ? 'success' : job.status === 'FAILED' ? 'danger' : 'info'} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        title="Register camera"
        description="Mapping a camera to a room enables occupancy verification requests at check-out."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCameraOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={createCamera} disabled={!form.name.trim()}>Register camera</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <FormField label="Camera name" required htmlFor="cam-name">
            <Input id="cam-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Room 101 doorway" />
          </FormField>
          <FormField label="Location" htmlFor="cam-location">
            <Input id="cam-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Mapped room" htmlFor="cam-room">
              <Select id="cam-room" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                options={[{ value: '', label: 'Not mapped' }, ...(rooms.data?.rooms ?? []).map((room) => ({ value: room.id, label: `Room ${room.roomNumber}` }))]} />
            </FormField>
            <FormField label="Mode" htmlFor="cam-mode">
              <Select id="cam-mode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}
                options={[{ value: 'UPLOAD_PROTOTYPE', label: 'Upload prototype' }, { value: 'RTSP', label: 'RTSP stream' }]} />
            </FormField>
          </div>
          {form.mode === 'RTSP' && (
            <FormField label="RTSP URL" htmlFor="cam-rtsp" hint="Stored server-side; never exposed to other tenants.">
              <Input id="cam-rtsp" value={form.rtspUrl} onChange={(e) => setForm({ ...form, rtspUrl: e.target.value })} placeholder="rtsp://…" />
            </FormField>
          )}
        </div>
      </Modal>
    </Page>
  );
}
