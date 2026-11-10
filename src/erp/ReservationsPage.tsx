/**
 * Reservations: list, filter and create bookings against real rooms.
 * Availability and overlap are enforced by the server (including a database
 * exclusion constraint), so conflicts surface as real 409 errors here.
 */

import { useMemo, useState } from 'react';
import { CalendarPlus, RefreshCw, XCircle } from 'lucide-react';
import { apiGet, apiPatch, apiPost, buildQuery, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from './useApi';
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, Page, dateOnly, money } from './ui';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataPresentation';
import { StatusBadge } from '../components/ui/StatusComponents';
import { Modal } from '../components/ui/Modal';
import { FormField, Input, Select, Textarea } from '../components/ui/FormControls';
import type { Guest, Reservation, Room } from './types';

const STATUSES = ['', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

export function ReservationsPage() {
  const { can, user } = useAuth();
  const currency = user?.currency ?? 'TZS';
  const [status, setStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    guestId: '',
    roomId: '',
    checkInDate: new Date().toISOString().slice(0, 10),
    checkOutDate: '',
    adults: '1',
    children: '0',
    source: 'DIRECT',
    rateAmount: '',
    notes: '',
  });

  const reservations = useApi(
    () => apiGet<{ reservations: Reservation[] }>(`/api/reservations${buildQuery({ status, limit: 200 })}`),
    [status]
  );
  const guests = useApi(() => apiGet<{ guests: Guest[] }>('/api/guests?limit=200'));
  const rooms = useApi(() => apiGet<{ rooms: Room[] }>('/api/rooms'));

  const canWrite = can('reservation.write');
  const availableRooms = useMemo(
    () => (rooms.data?.rooms ?? []).filter((room) => room.status !== 'OUT_OF_SERVICE'),
    [rooms.data]
  );

  async function submit() {
    setSaving(true);
    setFormError(null);
    try {
      await apiPost('/api/reservations', {
        guestId: form.guestId,
        roomId: form.roomId,
        checkInDate: form.checkInDate,
        checkOutDate: form.checkOutDate,
        adults: Number(form.adults),
        children: Number(form.children),
        source: form.source || 'DIRECT',
        rateAmount: form.rateAmount === '' ? null : Number(form.rateAmount),
        notes: form.notes || null,
      });
      setFormOpen(false);
      setMessage('Reservation created.');
      setForm({
        guestId: '',
        roomId: '',
        checkInDate: new Date().toISOString().slice(0, 10),
        checkOutDate: '',
        adults: '1',
        children: '0',
        source: 'DIRECT',
        rateAmount: '',
        notes: '',
      });
      reservations.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!cancelTarget) return;
    setSaving(true);
    setFormError(null);
    try {
      await apiPost(`/api/reservations/${cancelTarget.id}/cancel`, { reason: cancelReason || null });
      setCancelTarget(null);
      setCancelReason('');
      setMessage('Reservation cancelled.');
      reservations.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<Reservation>[] = [
    {
      key: 'guest',
      header: 'Guest',
      render: (row) => (
        <div>
          <p className="font-semibold text-[#152B4A]">{row.guestName}</p>
          <p className="text-[10px] text-[#8EA2BC]">Room {row.roomNumber}</p>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Stay',
      render: (row) => (
        <span className="text-[#5B6B82]">
          {dateOnly(row.checkInDate)} → {dateOnly(row.checkOutDate)}
        </span>
      ),
    },
    {
      key: 'pax',
      header: 'Pax',
      render: (row) => `${row.adults} adult(s)${row.children ? `, ${row.children} child(ren)` : ''}`,
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      render: (row) => (row.rateAmount === null ? '—' : money(row.rateAmount, currency)),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge
          label={row.status}
          tone={
            row.status === 'CONFIRMED' || row.status === 'COMPLETED'
              ? 'success'
              : row.status === 'CANCELLED' || row.status === 'NO_SHOW'
                ? 'danger'
                : 'info'
          }
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        canWrite && ['PENDING', 'CONFIRMED'].includes(row.status) ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<XCircle className="w-3.5 h-3.5" />}
            onClick={() => {
              setFormError(null);
              setCancelTarget(row);
            }}
          >
            Cancel
          </Button>
        ) : null,
    },
  ];

  return (
    <Page
      title="Reservations"
      subtitle="Bookings, availability and conflict-safe date changes."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={reservations.reload}>
            Refresh
          </Button>
          {canWrite && (
            <Button size="sm" icon={<CalendarPlus className="w-3.5 h-3.5" />} onClick={() => setFormOpen(true)}>
              New reservation
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

      <Card
        title="Reservation register"
        subtitle={`${reservations.data?.reservations.length ?? 0} record(s) shown`}
        actions={
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={STATUSES.map((value) => ({ value, label: value || 'All statuses' }))}
            className="w-44"
          />
        }
      >
        {reservations.error ? (
          <ErrorBlock message={reservations.error} onRetry={reservations.reload} />
        ) : reservations.loading ? (
          <LoadingBlock />
        ) : (reservations.data?.reservations.length ?? 0) === 0 ? (
          <EmptyBlock
            title="No reservations found"
            description={
              status
                ? `There are no reservations with status ${status}.`
                : 'Create the first reservation to start the booking calendar.'
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={reservations.data?.reservations ?? []}
            rowKey={(row) => row.id}
          />
        )}
      </Card>

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title="New reservation"
        description="The server rejects overlapping dates for the same room."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={submit} disabled={!form.guestId || !form.roomId || !form.checkOutDate}>
              Create reservation
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <FormField label="Guest" required htmlFor="res-guest">
            <Select
              id="res-guest"
              value={form.guestId}
              onChange={(e) => setForm({ ...form, guestId: e.target.value })}
              options={[
                { value: '', label: 'Select a guest' },
                ...(guests.data?.guests ?? []).map((guest) => ({
                  value: guest.id,
                  label: `${guest.fullName}${guest.phone ? ` · ${guest.phone}` : ''}`,
                })),
              ]}
            />
          </FormField>
          {guests.data?.guests.length === 0 && (
            <p className="text-[11px] text-[#B87503]">No guests exist yet. Add a guest under Front office → Guests first.</p>
          )}
          <FormField label="Room" required htmlFor="res-room">
            <Select
              id="res-room"
              value={form.roomId}
              onChange={(e) => setForm({ ...form, roomId: e.target.value })}
              options={[
                { value: '', label: 'Select a room' },
                ...availableRooms.map((room) => ({
                  value: room.id,
                  label: `Room ${room.roomNumber} · ${room.status}${room.pricing.overnightRate ? ` · ${money(room.pricing.overnightRate, currency)}` : ''}`,
                })),
              ]}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Check-in" required htmlFor="res-in">
              <Input
                id="res-in"
                type="date"
                value={form.checkInDate}
                onChange={(e) => setForm({ ...form, checkInDate: e.target.value })}
              />
            </FormField>
            <FormField label="Check-out" required htmlFor="res-out">
              <Input
                id="res-out"
                type="date"
                value={form.checkOutDate}
                onChange={(e) => setForm({ ...form, checkOutDate: e.target.value })}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Adults" htmlFor="res-adults">
              <Input
                id="res-adults"
                type="number"
                min={1}
                max={20}
                value={form.adults}
                onChange={(e) => setForm({ ...form, adults: e.target.value })}
              />
            </FormField>
            <FormField label="Children" htmlFor="res-children">
              <Input
                id="res-children"
                type="number"
                min={0}
                max={20}
                value={form.children}
                onChange={(e) => setForm({ ...form, children: e.target.value })}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Source" htmlFor="res-source">
              <Select
                id="res-source"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                options={['DIRECT', 'PHONE', 'WALK_IN', 'ONLINE', 'AGENT'].map((value) => ({
                  value,
                  label: value.replace('_', ' '),
                }))}
              />
            </FormField>
            <FormField label={`Rate (${currency})`} htmlFor="res-rate">
              <Input
                id="res-rate"
                type="number"
                min={0}
                step="0.01"
                value={form.rateAmount}
                onChange={(e) => setForm({ ...form, rateAmount: e.target.value })}
                placeholder="Optional"
              />
            </FormField>
          </div>
          <FormField label="Notes" htmlFor="res-notes">
            <Textarea
              id="res-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Special requests, arrival time…"
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel reservation"
        description={cancelTarget ? `${cancelTarget.guestName} · room ${cancelTarget.roomNumber}` : ''}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Keep reservation
            </Button>
            <Button variant="danger" loading={saving} onClick={cancel}>
              Cancel reservation
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-[#B42318]">{formError}</p>}
          <FormField label="Reason" htmlFor="cancel-reason" hint="Optional but recommended for the audit trail.">
            <Textarea
              id="cancel-reason"
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </FormField>
        </div>
      </Modal>

      <p className="text-[11px] text-[#8EA2BC]">
        Use the API-backed availability check when you need to confirm a room is free before quoting
        a rate. Overlap protection is enforced twice: a pre-flight query and a PostgreSQL exclusion
        constraint.
      </p>
    </Page>
  );
}
