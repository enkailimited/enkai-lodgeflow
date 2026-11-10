/**
 * Housekeeping and maintenance. The backend owns the room readiness sequence:
 * PENDING → CLEANING → INSPECTION → READY → AVAILABLE (front desk release).
 */

import { useState } from 'react';
import { CheckCircle2, ClipboardCheck, Play, Plus, RefreshCw, Wrench, XCircle } from 'lucide-react';
import { apiGet, apiPatch, apiPost, buildQuery, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from './useApi';
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, Page, dateTime } from './ui';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusComponents';
import { Modal } from '../components/ui/Modal';
import { FormField, Input, Select, Textarea } from '../components/ui/FormControls';
import type { HousekeepingTask, MaintenanceRequest, Room } from './types';

const TASK_STATUSES = ['', 'PENDING', 'IN_PROGRESS', 'INSPECTION', 'COMPLETED', 'FAILED'];
const MAINTENANCE_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];

function taskTone(status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'INSPECTION') return 'warning';
  if (status === 'IN_PROGRESS') return 'info';
  return 'neutral';
}

export function HousekeepingPage() {
  const { can } = useAuth();
  const [taskStatus, setTaskStatus] = useState('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [inspectTarget, setInspectTarget] = useState<HousekeepingTask | null>(null);
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ roomId: '', taskType: 'STAYOVER', priority: 'NORMAL', notes: '' });
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({ roomId: '', title: '', description: '', priority: 'NORMAL' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const tasks = useApi(
    () => apiGet<{ tasks: HousekeepingTask[] }>(`/api/housekeeping/tasks${buildQuery({ status: taskStatus })}`),
    [taskStatus]
  );
  const maintenance = useApi(() => apiGet<{ requests: MaintenanceRequest[] }>('/api/housekeeping/maintenance'));
  const rooms = useApi(() => apiGet<{ rooms: Room[] }>('/api/rooms'));

  const canWrite = can('housekeeping.write');
  const canMaintain = can('maintenance.write');

  async function act(task: HousekeepingTask, action: 'start' | 'submit') {
    setBusyId(task.id);
    setMessage(null);
    try {
      await apiPost(`/api/housekeeping/tasks/${task.id}/${action}`, {});
      setMessage({ tone: 'ok', text: action === 'start' ? `Cleaning started for room ${task.roomNumber}.` : `Room ${task.roomNumber} submitted for inspection.` });
      tasks.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  }

  async function inspect(passed: boolean) {
    if (!inspectTarget) return;
    setSaving(true);
    setFormError(null);
    try {
      const result = await apiPost<{ roomStatus: string }>(
        `/api/housekeeping/tasks/${inspectTarget.id}/inspect`,
        { passed, notes: inspectionNotes || null }
      );
      setMessage({
        tone: 'ok',
        text: passed
          ? `Inspection passed. Room ${inspectTarget.roomNumber} is ${result.roomStatus}.`
          : `Inspection failed. Room ${inspectTarget.roomNumber} is ${result.roomStatus}; a new cleaning task is required.`,
      });
      setInspectTarget(null);
      setInspectionNotes('');
      tasks.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function release(task: HousekeepingTask) {
    setBusyId(task.id);
    setMessage(null);
    try {
      await apiPost(`/api/housekeeping/rooms/${task.roomId}/ready`, {});
      setMessage({ tone: 'ok', text: `Room ${task.roomNumber} released to the front desk as AVAILABLE.` });
      tasks.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  }

  async function createTask() {
    setSaving(true);
    setFormError(null);
    try {
      await apiPost('/api/housekeeping/tasks', {
        roomId: taskForm.roomId,
        taskType: taskForm.taskType,
        priority: taskForm.priority,
        notes: taskForm.notes || null,
      });
      setCreateOpen(false);
      setMessage({ tone: 'ok', text: 'Housekeeping task created.' });
      tasks.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function createMaintenance() {
    setSaving(true);
    setFormError(null);
    try {
      await apiPost('/api/housekeeping/maintenance', {
        roomId: maintenanceForm.roomId || null,
        title: maintenanceForm.title,
        description: maintenanceForm.description || null,
        priority: maintenanceForm.priority,
      });
      setMaintenanceOpen(false);
      setMessage({ tone: 'ok', text: 'Maintenance request logged.' });
      maintenance.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function setMaintenanceStatus(request: MaintenanceRequest, status: string) {
    setMessage(null);
    try {
      await apiPatch(`/api/housekeeping/maintenance/${request.id}`, { status });
      maintenance.reload();
      setMessage({ tone: 'ok', text: `Maintenance request marked ${status}.` });
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }

  return (
    <Page
      title="Housekeeping"
      subtitle="Cleaning, inspections and maintenance — the only path to a sellable room."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => { tasks.reload(); maintenance.reload(); }}>
            Refresh
          </Button>
          {canWrite && (
            <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setFormError(null); setCreateOpen(true); }}>
              New task
            </Button>
          )}
          {canMaintain && (
            <Button size="sm" icon={<Wrench className="w-3.5 h-3.5" />} onClick={() => { setFormError(null); setMaintenanceOpen(true); }}>
              Log maintenance
            </Button>
          )}
        </div>
      }
    >
      {message && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-xs ${
            message.tone === 'ok'
              ? 'border-[#12B981]/30 bg-[#12B981]/8 text-[#0D7A54]'
              : 'border-[#EF4444]/25 bg-[#EF4444]/5 text-[#B42318]'
          }`}
        >
          {message.text}
        </div>
      )}

      <Card
        title="Cleaning tasks"
        subtitle="Assignment and lifecycle follow the server workflow"
        actions={
          <Select
            value={taskStatus}
            onChange={(e) => setTaskStatus(e.target.value)}
            options={TASK_STATUSES.map((value) => ({ value, label: value || 'All statuses' }))}
            className="w-44"
          />
        }
      >
        {tasks.error ? (
          <ErrorBlock message={tasks.error} onRetry={tasks.reload} />
        ) : tasks.loading ? (
          <LoadingBlock />
        ) : (tasks.data?.tasks.length ?? 0) === 0 ? (
          <EmptyBlock title="No housekeeping tasks" description={taskStatus ? `There are no tasks with status ${taskStatus}.` : 'Departure tasks are created automatically at check-out.'} />
        ) : (
          <div className="space-y-2">
            {tasks.data?.tasks.map((task) => (
              <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1EAF5] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[#152B4A]">Room {task.roomNumber}</p>
                  <p className="text-[11px] text-[#8EA2BC]">
                    {task.taskType.replace('_', ' ')} · {task.priority} priority · created {dateTime(task.createdAt)}
                    {task.assignedToName ? ` · ${task.assignedToName}` : ' · unassigned'}
                  </p>
                  {task.notes && <p className="text-[11px] text-[#5B6B82] mt-0.5">{task.notes}</p>}
                  {task.inspectionNotes && <p className="text-[11px] text-[#5B6B82] mt-0.5">Inspection: {task.inspectionNotes}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge label={task.status} tone={taskTone(task.status)} />
                  {canWrite && task.status === 'PENDING' && (
                    <Button size="sm" icon={<Play className="w-3.5 h-3.5" />} loading={busyId === task.id} onClick={() => act(task, 'start')}>
                      Start cleaning
                    </Button>
                  )}
                  {canWrite && task.status === 'IN_PROGRESS' && (
                    <Button size="sm" icon={<ClipboardCheck className="w-3.5 h-3.5" />} loading={busyId === task.id} onClick={() => act(task, 'submit')}>
                      Submit for inspection
                    </Button>
                  )}
                  {canWrite && task.status === 'INSPECTION' && (
                    <Button size="sm" icon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => { setFormError(null); setInspectTarget(task); }}>
                      Inspect
                    </Button>
                  )}
                  {canWrite && task.status === 'COMPLETED' && (
                    <Button size="sm" variant="secondary" loading={busyId === task.id} onClick={() => release(task)}>
                      Release room
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Maintenance" subtitle="Requests logged by staff; resolve them when the fix is confirmed">
        {maintenance.error ? (
          <ErrorBlock message={maintenance.error} onRetry={maintenance.reload} />
        ) : maintenance.loading ? (
          <LoadingBlock />
        ) : (maintenance.data?.requests.length ?? 0) === 0 ? (
          <EmptyBlock title="No maintenance requests" description="Log the first issue to track repairs against rooms." />
        ) : (
          <div className="space-y-2">
            {maintenance.data?.requests.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1EAF5] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[#152B4A]">{request.title}</p>
                  <p className="text-[11px] text-[#8EA2BC]">
                    {request.room_number ? `Room ${request.room_number} · ` : ''}
                    {request.priority} priority · {dateTime(request.created_at)}
                  </p>
                  {request.description && <p className="text-[11px] text-[#5B6B82] mt-0.5">{request.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={request.status} tone={request.status === 'RESOLVED' ? 'success' : request.status === 'CANCELLED' ? 'neutral' : 'warning'} />
                  {canMaintain && request.status !== 'RESOLVED' && request.status !== 'CANCELLED' && (
                    <Button size="sm" variant="outline" onClick={() => setMaintenanceStatus(request, 'RESOLVED')}>
                      Mark resolved
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New housekeeping task"
        description="Use this for stayover cleaning or ad-hoc work, not for departure turns (created at check-out)."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={createTask} disabled={!taskForm.roomId}>Create task</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <FormField label="Room" required htmlFor="hk-room">
            <Select
              id="hk-room"
              value={taskForm.roomId}
              onChange={(e) => setTaskForm({ ...taskForm, roomId: e.target.value })}
              options={[
                { value: '', label: 'Select a room' },
                ...(rooms.data?.rooms ?? []).map((room) => ({ value: room.id, label: `Room ${room.roomNumber} · ${room.status}` })),
              ]}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Task type" htmlFor="hk-type">
              <Select id="hk-type" value={taskForm.taskType} onChange={(e) => setTaskForm({ ...taskForm, taskType: e.target.value })}
                options={['STAYOVER', 'DEPARTURE', 'DEEP_CLEAN', 'MAINTENANCE'].map((value) => ({ value, label: value.replace('_', ' ') }))} />
            </FormField>
            <FormField label="Priority" htmlFor="hk-priority">
              <Select id="hk-priority" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => ({ value, label: value }))} />
            </FormField>
          </div>
          <FormField label="Notes" htmlFor="hk-notes">
            <Textarea id="hk-notes" rows={2} value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} />
          </FormField>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(inspectTarget)}
        onClose={() => setInspectTarget(null)}
        title="Room inspection"
        description={inspectTarget ? `Room ${inspectTarget.roomNumber}` : ''}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInspectTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={saving} icon={<XCircle className="w-3.5 h-3.5" />} onClick={() => inspect(false)}>
              Fail inspection
            </Button>
            <Button loading={saving} icon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => inspect(true)}>
              Pass inspection
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <p className="text-xs text-[#5B6B82]">
            Passing sets the room to <strong>READY</strong>. A failed inspection records the failure and
            returns the room to cleaning.
          </p>
          <FormField label="Inspection notes" htmlFor="inspection-notes">
            <Textarea id="inspection-notes" rows={3} value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} />
          </FormField>
        </div>
      </Modal>

      <Modal
        isOpen={maintenanceOpen}
        onClose={() => setMaintenanceOpen(false)}
        title="Log maintenance"
        description="Requests are visible to maintenance staff and reported on."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMaintenanceOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={createMaintenance} disabled={!maintenanceForm.title.trim()}>Log request</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <FormField label="Room" htmlFor="mt-room" hint="Leave blank for common areas.">
            <Select
              id="mt-room"
              value={maintenanceForm.roomId}
              onChange={(e) => setMaintenanceForm({ ...maintenanceForm, roomId: e.target.value })}
              options={[
                { value: '', label: 'No specific room' },
                ...(rooms.data?.rooms ?? []).map((room) => ({ value: room.id, label: `Room ${room.roomNumber}` })),
              ]}
            />
          </FormField>
          <FormField label="Title" required htmlFor="mt-title">
            <Input id="mt-title" value={maintenanceForm.title} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })} />
          </FormField>
          <FormField label="Description" htmlFor="mt-description">
            <Textarea id="mt-description" rows={2} value={maintenanceForm.description} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} />
          </FormField>
          <FormField label="Priority" htmlFor="mt-priority">
            <Select id="mt-priority" value={maintenanceForm.priority} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, priority: e.target.value })}
              options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => ({ value, label: value }))} />
          </FormField>
        </div>
      </Modal>
    </Page>
  );
}
