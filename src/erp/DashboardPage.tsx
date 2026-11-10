/**
 * Operational dashboard — every figure comes from /api/reports/dashboard and
 * /api/business/summary. Nothing is fabricated when the lodge is empty.
 */

import {
  AlertTriangle,
  BedDouble,
  CalendarCheck,
  CircleDollarSign,
  DoorOpen,
  Sparkles,
  Users,
} from 'lucide-react';
import { apiGet } from '../api/client';
import { useApi } from './useApi';
import { Card, ErrorBlock, LoadingBlock, Page, dateTime, money } from './ui';
import { StatCard } from '../components/ui/DataPresentation';
import { StatusBadge } from '../components/ui/StatusComponents';
import { useAuth } from '../auth/AuthContext';
import type { BusinessSummary, DashboardData } from './types';

export function DashboardPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? 'TZS';
  const dashboard = useApi(() => apiGet<DashboardData>('/api/reports/dashboard'));
  const summary = useApi(() => apiGet<{ summary: BusinessSummary }>('/api/business/summary'));

  if (dashboard.loading) return <LoadingBlock label="Loading today’s operations…" />;
  if (dashboard.error || !dashboard.data) {
    return (
      <Page title="Dashboard" subtitle="Live operational picture for your lodge.">
        <ErrorBlock
          message={dashboard.error ?? 'Dashboard data is unavailable.'}
          onRetry={dashboard.reload}
        />
      </Page>
    );
  }

  const data = dashboard.data;
  const peak = Math.max(1, ...data.revenueTrend.map((point) => point.total));

  return (
    <Page
      title={`Good day${user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}`}
      subtitle={`${user?.tenantName ?? 'Platform'} · ${user?.timezone ?? 'Africa/Dar_es_Salaam'}`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Rooms occupied"
          value={`${data.rooms.occupied} / ${data.rooms.total}`}
          supportingText={`${data.rooms.occupancyRate}% occupancy`}
          icon={<BedDouble className="w-5 h-5" />}
          iconTone="blue"
          ringPercentage={data.rooms.occupancyRate}
        />
        <StatCard
          label="Guests in house"
          value={data.currentGuests}
          supportingText={`${data.arrivalsToday} arrival(s) · ${data.departuresToday} departure(s) scheduled`}
          icon={<Users className="w-5 h-5" />}
          iconTone="green"
        />
        <StatCard
          label="Revenue today"
          value={money(data.revenueToday, currency)}
          supportingText="Payments received today"
          icon={<CircleDollarSign className="w-5 h-5" />}
          iconTone="navy"
        />
        <StatCard
          label="Outstanding"
          value={money(data.outstandingBalance, currency)}
          supportingText={`${data.outstandingInvoices} issued invoice(s) unpaid`}
          icon={<AlertTriangle className="w-5 h-5" />}
          iconTone="amber"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Room status" subtitle="Derived from the room inventory" className="xl:col-span-1">
          <div className="space-y-2 text-xs">
            {[
              ['Available', data.rooms.available, 'success'],
              ['Occupied', data.rooms.occupied, 'info'],
              ['Reserved', data.rooms.reserved, 'warning'],
              ['Cleaning / dirty', data.rooms.cleaning, 'warning'],
              ['Awaiting inspection', data.rooms.inspection, 'warning'],
              ['Ready for release', data.rooms.ready, 'success'],
              ['Maintenance', data.rooms.maintenance, 'danger'],
              ['Out of service', data.rooms.outOfService, 'danger'],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between">
                <span className="text-[#5B6B82]">{label}</span>
                <span className="font-semibold text-[#152B4A]">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Revenue — last 7 days" subtitle="Payments recorded per day" className="xl:col-span-2">
          <div className="flex items-end gap-3 h-40">
            {data.revenueTrend.map((point) => (
              <div key={point.day} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex items-end justify-center h-28">
                  <div
                    className="w-full max-w-10 rounded-t-md bg-[#1769E8]/80"
                    style={{ height: `${Math.max(4, (point.total / peak) * 100)}%` }}
                    title={money(point.total, currency)}
                  />
                </div>
                <span className="text-[10px] text-[#8EA2BC]">{point.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Recent check-ins" subtitle="Most recent stays opened">
          {data.recentCheckIns.length === 0 ? (
            <p className="text-xs text-[#8EA2BC]">No check-ins recorded yet.</p>
          ) : (
            <ul className="divide-y divide-[#E1EAF5]">
              {data.recentCheckIns.map((row) => (
                <li key={row.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-[#152B4A]">{row.guest_name}</p>
                    <p className="text-[#8EA2BC]">Room {row.room_number}</p>
                  </div>
                  <span className="text-[#5B6B82]">{dateTime(row.check_in_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent check-outs" subtitle="Stays closed by the front desk">
          {data.recentCheckOuts.length === 0 ? (
            <p className="text-xs text-[#8EA2BC]">No check-outs recorded yet.</p>
          ) : (
            <ul className="divide-y divide-[#E1EAF5]">
              {data.recentCheckOuts.map((row) => (
                <li key={row.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-[#152B4A]">{row.guest_name}</p>
                    <p className="text-[#8EA2BC]">Room {row.room_number}</p>
                  </div>
                  <span className="text-[#5B6B82]">{dateTime(row.check_out_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {summary.data && (
        <Card title="Business footprint" subtitle="Record counts held for this business">
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 text-center">
            {[
              ['Branches', summary.data.summary.branches],
              ['Rooms', summary.data.summary.rooms],
              ['Guests', summary.data.summary.guests],
              ['Staff', summary.data.summary.staff],
              ['In house', summary.data.summary.in_house],
              ['Cameras', summary.data.summary.cameras],
              ['Open alerts', summary.data.summary.open_alerts],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-[#E1EAF5] bg-[#F9FBFE] px-3 py-3">
                <p className="text-lg font-bold text-[#152B4A]">{value}</p>
                <p className="text-[10px] uppercase tracking-wide text-[#8EA2BC] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Branch performance" subtitle="Rooms and today’s revenue by branch">
        {data.branchPerformance.length === 0 ? (
          <p className="text-xs text-[#8EA2BC]">No branches configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-[#8EA2BC]">
                  <th className="py-2 pr-4">Branch</th>
                  <th className="py-2 pr-4">Rooms</th>
                  <th className="py-2 pr-4">Occupied</th>
                  <th className="py-2 text-right">Revenue today</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1EAF5]">
                {data.branchPerformance.map((row) => (
                  <tr key={row.branchId}>
                    <td className="py-2 pr-4 font-semibold text-[#152B4A]">{row.branchName}</td>
                    <td className="py-2 pr-4">{row.rooms}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge
                        label={row.occupied > 0 ? `${row.occupied} occupied` : 'Vacant'}
                        tone={row.occupied > 0 ? 'info' : 'neutral'}
                      />
                    </td>
                    <td className="py-2 text-right">{money(row.revenueToday, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data.rooms.total === 0 && (
        <Card>
          <div className="flex items-start gap-3 text-xs text-[#5B6B82]">
            <Sparkles className="w-4 h-4 text-[#1769E8] mt-0.5 shrink-0" />
            <p>
              Your business has no rooms yet. Add room categories and rooms under
              <strong> Rooms &amp; housekeeping → Rooms</strong> to start taking
              reservations. This dashboard stays empty until real records exist —
              it never shows sample statistics.
            </p>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 text-[11px] text-[#8EA2BC]">
        <CalendarCheck className="w-3.5 h-3.5" />
        <span>Figures refresh whenever you open or reload a page.</span>
        <DoorOpen className="w-3.5 h-3.5 ml-4" />
        <span>Room lifecycle is owned by front desk and housekeeping, not CCTV.</span>
      </div>
    </Page>
  );
}
