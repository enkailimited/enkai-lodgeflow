/**
 * Room inventory: categories, rooms, pricing and operational status.
 * All writes go through the protected room API; the availability lifecycle
 * (DIRTY → CLEANING → INSPECTION → READY → AVAILABLE) is driven by front desk
 * and housekeeping workflows.
 */

import { useMemo, useState } from 'react';
import { BedDouble, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from './useApi';
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, Page, money } from './ui';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataPresentation';
import { StatusBadge } from '../components/ui/StatusComponents';
import { Modal } from '../components/ui/Modal';
import { FormField, Input, Select, Textarea } from '../components/ui/FormControls';
import type { Room, RoomCategory } from './types';

const EDITABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'MAINTENANCE', 'OUT_OF_SERVICE'];

const emptyRoom = {
  roomNumber: '',
  name: '',
  categoryId: '',
  floor: '',
  capacity: '2',
  status: 'AVAILABLE',
  description: '',
  hourlyRate: '',
  dailyRate: '',
  overnightRate: '',
};

function toneForStatus(status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'AVAILABLE':
      return 'success';
    case 'OCCUPIED':
      return 'info';
    case 'DIRTY':
    case 'CLEANING':
    case 'INSPECTION':
      return 'warning';
    case 'MAINTENANCE':
    case 'OUT_OF_SERVICE':
      return 'danger';
    case 'READY':
      return 'success';
    default:
      return 'neutral';
  }
}

export function RoomsPage() {
  const { can, user } = useAuth();
  const currency = user?.currency ?? 'TZS';
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [form, setForm] = useState(emptyRoom);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);

  const rooms = useApi(() => apiGet<{ rooms: Room[] }>('/api/rooms'));
  const categories = useApi(() => apiGet<{ categories: RoomCategory[] }>('/api/room-categories'));

  const canWrite = can('room.write');
  const canDelete = can('room.delete');
  const categoryNameById = useMemo(
    () => new Map((categories.data?.categories ?? []).map((category) => [category.id, category.name])),
    [categories.data]
  );

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyRoom, categoryId: categories.data?.categories[0]?.id ?? '' });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(room: Room) {
    setEditing(room);
    setForm({
      roomNumber: room.roomNumber,
      name: room.name ?? '',
      categoryId: room.categoryId,
      floor: room.floor,
      capacity: String(room.capacity),
      status: room.status,
      description: room.description ?? '',
      hourlyRate: room.pricing.hourlyRate === null ? '' : String(room.pricing.hourlyRate),
      dailyRate: room.pricing.dailyRate === null ? '' : String(room.pricing.dailyRate),
      overnightRate: room.pricing.overnightRate === null ? '' : String(room.pricing.overnightRate),
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submit() {
    setSaving(true);
    setFormError(null);
    const payload = {
      roomNumber: form.roomNumber,
      name: form.name || null,
      categoryId: form.categoryId,
      floor: form.floor,
      capacity: Number(form.capacity),
      status: form.status,
      description: form.description || null,
      pricing: {
        hourlyRate: form.hourlyRate === '' ? null : Number(form.hourlyRate),
        dailyRate: form.dailyRate === '' ? null : Number(form.dailyRate),
        overnightRate: form.overnightRate === '' ? null : Number(form.overnightRate),
        currency: 'TZS',
      },
    };
    try {
      if (editing) await apiPatch(`/api/rooms/${editing.id}`, payload);
      else await apiPost('/api/rooms', payload);
      setMessage(editing ? `Room ${form.roomNumber} updated.` : `Room ${form.roomNumber} created.`);
      setFormOpen(false);
      rooms.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(room: Room, status: string) {
    setMessage(null);
    try {
      await apiPatch(`/api/rooms/${room.id}`, { status });
      setMessage(`Room ${room.roomNumber} marked ${status}.`);
      rooms.reload();
    } catch (err) {
      setMessage(errorMessage(err));
    }
  }

  async function createCategory() {
    setSaving(true);
    setFormError(null);
    try {
      await apiPost('/api/room-categories', { name: categoryName, description: null });
      setCategoryOpen(false);
      setCategoryName('');
      setMessage('Room category created.');
      categories.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeRoom() {
    if (!deleteTarget) return;
    setSaving(true);
    setFormError(null);
    try {
      await apiDelete(`/api/rooms/${deleteTarget.id}`);
      setMessage(`Room ${deleteTarget.roomNumber} archived.`);
      setDeleteTarget(null);
      rooms.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<Room>[] = [
    {
      key: 'room',
      header: 'Room',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-[#EAF3FF] text-[#1769E8] flex items-center justify-center shrink-0">
            <BedDouble className="w-3.5 h-3.5" />
          </span>
          <div>
            <p className="font-semibold text-[#152B4A]">Room {row.roomNumber}</p>
            <p className="text-[10px] text-[#8EA2BC]">{row.name ?? 'Unnamed'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => categoryNameById.get(row.categoryId) ?? '—',
    },
    { key: 'floor', header: 'Floor', render: (row) => row.floor },
    { key: 'capacity', header: 'Capacity', align: 'center', render: (row) => row.capacity },
    {
      key: 'rates',
      header: 'Overnight / daily',
      align: 'right',
      render: (row) => (
        <span>
          {row.pricing.overnightRate === null ? 'Not set' : money(row.pricing.overnightRate, currency)}
          <span className="text-[#8EA2BC]"> · </span>
          {row.pricing.dailyRate === null ? 'Not set' : money(row.pricing.dailyRate, currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex items-center gap-2">
          <StatusBadge label={row.status} tone={toneForStatus(row.status)} dot />
          {canWrite && EDITABLE_STATUSES.includes(row.status) && (
            <Select
              value={row.status}
              onChange={(e) => changeStatus(row, e.target.value)}
              options={EDITABLE_STATUSES.map((value) => ({ value, label: value.replace('_', ' ') }))}
              className="h-7 text-[10px] w-32"
              aria-label={`Change status for room ${row.roomNumber}`}
            />
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          {canWrite && (
            <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
              Edit
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setDeleteTarget(row)}>
              Archive
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Page
      title="Rooms"
      subtitle="Room inventory, categories and published nightly rates."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => { rooms.reload(); categories.reload(); }}>
            Refresh
          </Button>
          {canWrite && (
            <Button variant="secondary" size="sm" onClick={() => { setFormError(null); setCategoryOpen(true); }}>
              New category
            </Button>
          )}
          {canWrite && (
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate} disabled={(categories.data?.categories.length ?? 0) === 0}>
              New room
            </Button>
          )}
        </div>
      }
    >
      {message && (
        <div className="rounded-xl border border-[#12B981]/30 bg-[#12B981]/8 px-4 py-2.5 text-xs text-[#0D7A54]">
          {message}
        </div>
      )}

      {(categories.data?.categories.length ?? 0) === 0 && !categories.loading && (
        <div className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/8 px-4 py-3 text-xs text-[#8A5B00]">
          Create a room category first. Rooms must belong to a category so pricing and reporting stay
          consistent.
        </div>
      )}

      <Card title="Room register" subtitle={`${rooms.data?.rooms.length ?? 0} active room(s)`}>
        {rooms.error ? (
          <ErrorBlock message={rooms.error} onRetry={rooms.reload} />
        ) : rooms.loading ? (
          <LoadingBlock />
        ) : (rooms.data?.rooms.length ?? 0) === 0 ? (
          <EmptyBlock
            title="No rooms yet"
            description="Create a category, then add the lodge’s rooms with their published rates."
          />
        ) : (
          <DataTable columns={columns} data={rooms.data?.rooms ?? []} rowKey={(row) => row.id} />
        )}
      </Card>

      <Card title="Categories" subtitle="Shared pricing groups for rooms">
        {(categories.data?.categories.length ?? 0) === 0 ? (
          <p className="text-xs text-[#8EA2BC]">No categories yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {categories.data?.categories.map((category) => (
              <li key={category.id} className="rounded-full border border-[#E1EAF5] bg-[#F9FBFE] px-3 py-1 text-xs text-[#5B6B82]">
                {category.name}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit room ${editing.roomNumber}` : 'New room'}
        description="Rates left blank stay unconfigured — they are never treated as zero."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={saving}
              onClick={submit}
              disabled={!form.roomNumber.trim() || !form.floor.trim() || !form.categoryId}
            >
              {editing ? 'Save changes' : 'Create room'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Room number" required htmlFor="room-number">
              <Input id="room-number" value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} />
            </FormField>
            <FormField label="Name" htmlFor="room-name">
              <Input id="room-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Optional" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Category" required htmlFor="room-category">
              <Select
                id="room-category"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                options={[
                  { value: '', label: 'Select a category' },
                  ...(categories.data?.categories ?? []).map((category) => ({ value: category.id, label: category.name })),
                ]}
              />
            </FormField>
            <FormField label="Floor" required htmlFor="room-floor">
              <Input id="room-floor" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="e.g. Ground floor" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Capacity" required htmlFor="room-capacity">
              <Input id="room-capacity" type="number" min={1} max={20} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </FormField>
            <FormField label="Status" htmlFor="room-status">
              <Select
                id="room-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                options={EDITABLE_STATUSES.map((value) => ({ value, label: value.replace('_', ' ') }))}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label={`Hourly (${currency})`} htmlFor="room-hourly">
              <Input id="room-hourly" type="number" min={0} step="0.01" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} placeholder="Not set" />
            </FormField>
            <FormField label={`Daily (${currency})`} htmlFor="room-daily">
              <Input id="room-daily" type="number" min={0} step="0.01" value={form.dailyRate} onChange={(e) => setForm({ ...form, dailyRate: e.target.value })} placeholder="Not set" />
            </FormField>
            <FormField label={`Overnight (${currency})`} htmlFor="room-overnight">
              <Input id="room-overnight" type="number" min={0} step="0.01" value={form.overnightRate} onChange={(e) => setForm({ ...form, overnightRate: e.target.value })} placeholder="Not set" />
            </FormField>
          </div>
          <FormField label="Description" htmlFor="room-description">
            <Textarea id="room-description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormField>
        </div>
      </Modal>

      <Modal
        isOpen={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title="New room category"
        description="Category names are unique per business (case-insensitive)."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCategoryOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={createCategory} disabled={!categoryName.trim()}>
              Create category
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <FormField label="Category name" required htmlFor="category-name">
            <Input id="category-name" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="e.g. Garden Chalet" />
          </FormField>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Archive room"
        description={deleteTarget ? `Room ${deleteTarget.roomNumber}` : ''}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Keep room
            </Button>
            <Button variant="danger" loading={saving} onClick={removeRoom}>
              Archive room
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-xs text-[#5B6B82]">
          {formError && <p className="text-[#B42318]">{formError}</p>}
          <p>
            Archiving is a soft delete: historical reservations and stays keep referencing this room.
            Rooms with active reservations cannot be archived.
          </p>
        </div>
      </Modal>
    </Page>
  );
}
