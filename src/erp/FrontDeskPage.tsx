/**
 * Front desk: today's arrivals, in-house guests and departures.
 * Check-in/check-out call the real backend workflow, which owns the room
 * lifecycle, housekeeping task creation and CCTV verification request.
 */

import { useState } from 'react';
import { LogIn, LogOut, RefreshCw } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from './useApi';
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, Page, dateTime, money } from './ui';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusComponents';
import { Modal } from '../components/ui/Modal';
import { Checkbox, DatePicker } from '../components/ui/FormControls';
import type { Arrival, Departure, GuestStay, Room } from './types';

type Tab = 'arrivals' | 'in-house' | 'departures';

export function FrontDeskPage() {
  const { can, user } = useAuth();
  const currency = user?.currency ?? 'TZS';
  const [tab, setTab] = useState<Tab>('arrivals');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<GuestStay | null>(null);
  const [allowOutstanding, setAllowOutstanding] = useState(false);
  const [departureTarget, setDepartureTarget] = useState<Departure | null>(null);

  const arrivals = useApi(() => apiGet<{ arrivals: Arrival[] }>('/api/front-office/arrivals'));
  const inHouse = useApi(() => apiGet<{ stays: GuestStay[] }>('/api/front-office/in-house'));
  const departures = useApi(() => apiGet<{ departures: Departure[] }>('/api/front-office/departures'));
  const rooms = useApi(() => apiGet<{ rooms: Room[] }>('/api/rooms'));

  const canCheckIn = can('frontdesk.checkin');
  const canCheckOut = can('frontdesk.checkout');

  function reloadAll() {
    arrivals.reload();
    inHouse.reload();
    departures.reload();
  }

  async function checkInReservation(arrival: Arrival) {
    setBusyId(arrival.id);
    setMessage(null);
    try {
      await apiPost('/api/front-office/check-in', { reservationId: arrival.id });
      setMessage({ tone: 'ok', text: `${arrival.guest_name} checked in to room ${arrival.room_number}.` });
      reloadAll();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  }

  async function checkOut(stayId: string, allow: boolean) {
    setBusyId(stayId);
    setMessage(null);
    try {
      const result = await apiPost<{ cctvVerificationRequested: boolean; housekeepingTaskId: string }>(
        '/api/front-office/check-out',
        { stayId, allowOutstanding: allow }
      );
      setMessage({
        tone: 'ok',
        text: result.cctvVerificationRequested
          ? 'Checked out. The room is dirty, a housekeeping task was created and CCTV was asked to verify occupancy (evidence only).'
          : 'Checked out. The room is dirty and a housekeeping task was created.',
      });
      setCheckoutTarget(null);
      setDepartureTarget(null);
      setAllowOutstanding(false);
      reloadAll();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  }

  const active = tab === 'arrivals' ? arrivals : tab === 'in-house' ? inHouse : departures;
  const roomStatus = new Map((rooms.data?.rooms ?? []).map((room) => [room.id, room.status]));

  return (
    <Page
      title="Front desk"
      subtitle="Arrivals, in-house guests and departures for today."
      actions={
        <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={reloadAll}>
          Refresh
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['arrivals', `Arrivals (${arrivals.data?.arrivals.length ?? 0})`],
            ['in-house', `In house (${inHouse.data?.stays.length ?? 0})`],
            ['departures', `Departures (${departures.data?.departures.length ?? 0})`],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3.5 h-8 rounded-lg text-xs font-semibold border transition-colors ${
              tab === key
                ? 'bg-[#1769E8] text-white border-[#1769E8]'
                : 'bg-white text-[#5B6B82] border-[#E1EAF5] hover:border-[#1769E8]/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs ${
            message.tone === 'ok'
              ? 'border-[#12B981]/30 bg-[#12B981]/8 text-[#0D7A54]'
              : 'border-[#EF4444]/25 bg-[#EF4444]/5 text-[#B42318]'
          }`}
        >
          {message.text}
        </div>
      )}

      {active.loading && <LoadingBlock />}
      {active.error && <ErrorBlock message={active.error} onRetry={active.reload} />}

      {!active.loading && !active.error && tab === 'arrivals' && (
        <Card title="Expected today" subtitle="Pending and confirmed reservations checking in today">
          {arrivals.data?.arrivals.length === 0 ? (
            <EmptyBlock title="No arrivals today" description="Reservations with today’s check-in date will appear here." />
          ) : (
            <div className="space-y-2">
              {arrivals.data?.arrivals.map((arrival) => (
                <div
                  key={arrival.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1EAF5] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#152B4A]">{arrival.guest_name}</p>
                    <p className="text-[11px] text-[#8EA2BC]">
                      Room {arrival.room_number} · {arrival.check_in_date} → {arrival.check_out_date} · {arrival.adults} adult(s)
                      {arrival.children > 0 ? `, ${arrival.children} child(ren)` : ''}
                      {arrival.phone ? ` · ${arrival.phone}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge label={arrival.status} tone="info" />
                    <StatusBadge
                      label={`Room ${roomStatus.get(arrival.room_id) ?? 'unknown'}`}
                      tone={roomStatus.get(arrival.room_id) === 'AVAILABLE' ? 'success' : 'warning'}
                    />
                    {canCheckIn && (
                      <Button
                        size="sm"
                        icon={<LogIn className="w-3.5 h-3.5" />}
                        loading={busyId === arrival.id}
                        onClick={() => checkInReservation(arrival)}
                      >
                        Check in
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!active.loading && !active.error && tab === 'in-house' && (
        <Card title="In-house guests" subtitle="Active stays; check-out closes the stay and dirties the room">
          {inHouse.data?.stays.length === 0 ? (
            <EmptyBlock title="No guests in house" description="Check a guest in from the arrivals tab to start a stay." />
          ) : (
            <div className="space-y-2">
              {inHouse.data?.stays.map((stay) => (
                <div
                  key={stay.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1EAF5] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#152B4A]">{stay.guestName}</p>
                    <p className="text-[11px] text-[#8EA2BC]">
                      Room {stay.roomNumber} · in since {dateTime(stay.checkInAt)}
                      {stay.roomCharge ? ` · room charge ${money(stay.roomCharge, currency)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge label={stay.status} tone="info" />
                    {canCheckOut && (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<LogOut className="w-3.5 h-3.5" />}
                        loading={busyId === stay.id}
                        onClick={() => {
                          setCheckoutTarget(stay);
                          setAllowOutstanding(false);
                        }}
                      >
                        Check out
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!active.loading && !active.error && tab === 'departures' && (
        <Card title="Departures" subtitle="Active stays with an outstanding balance shown">
          {departures.data?.departures.length === 0 ? (
            <EmptyBlock title="No departures pending" description="Active stays appear here until they are checked out." />
          ) : (
            <div className="space-y-2">
              {departures.data?.departures.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1EAF5] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#152B4A]">{row.guest_name}</p>
                    <p className="text-[11px] text-[#8EA2BC]">
                      Room {row.room_number} · in since {dateTime(row.check_in_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={row.outstanding > 0 ? `Outstanding ${money(row.outstanding, currency)}` : 'Settled'}
                      tone={row.outstanding > 0 ? 'danger' : 'success'}
                    />
                    {canCheckOut && (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<LogOut className="w-3.5 h-3.5" />}
                        loading={busyId === row.id}
                        onClick={() => setDepartureTarget(row)}
                      >
                        Check out
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal
        isOpen={Boolean(checkoutTarget || departureTarget)}
        onClose={() => {
          setCheckoutTarget(null);
          setDepartureTarget(null);
          setAllowOutstanding(false);
        }}
        title="Confirm check-out"
        description={
          departureTarget
            ? `${departureTarget.guest_name} · room ${departureTarget.room_number}`
            : checkoutTarget
              ? `${checkoutTarget.guestName} · room ${checkoutTarget.roomNumber}`
              : ''
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCheckoutTarget(null);
                setDepartureTarget(null);
                setAllowOutstanding(false);
              }}
            >
              Cancel
            </Button>
            <Button
              loading={busyId === (checkoutTarget?.id ?? departureTarget?.id ?? '')}
              onClick={() =>
                checkOut(checkoutTarget?.id ?? departureTarget?.id ?? '', allowOutstanding)
              }
            >
              Check out
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-[#5B6B82]">
          <p>
            Check-out closes the stay, marks the room <strong>DIRTY</strong>, creates a departure
            housekeeping task, and asks CCTV to verify occupancy when a camera is mapped. CCTV never
            changes the room status itself.
          </p>
          {(departureTarget?.outstanding ?? 0) > 0 && (
            <>
              <p className="text-[#B42318]">
                Outstanding balance: {money(departureTarget?.outstanding ?? 0, currency)}. The backend
                blocks check-out while money is owed unless you explicitly allow it.
              </p>
              <Checkbox
                checked={allowOutstanding}
                onChange={setAllowOutstanding}
                label="Allow check-out with an outstanding balance"
                description="This is recorded in the audit trail."
              />
            </>
          )}
          <p className="text-[10px] text-[#8EA2BC]">
            Checking out requires the frontdesk.checkout permission.
          </p>
        </div>
      </Modal>

      <div className="text-[11px] text-[#8EA2BC] flex items-center gap-2">
        <DatePicker value={new Date().toISOString().slice(0, 10)} readOnly className="w-36" />
        <span>Front desk always works on server time (Africa/Dar_es_Salaam).</span>
      </div>
    </Page>
  );
}
