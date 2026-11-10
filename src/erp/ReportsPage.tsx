/**
 * Reports calculated from stored records. Date ranges are sent to the server;
 * the page never recomputes financial or occupancy figures in the browser.
 */

import { useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { apiGet, buildQuery } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from './useApi';
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, Page, dateOnly, money } from './ui';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusComponents';
import { FormField, Input } from '../components/ui/FormControls';
import type { CctvSummary } from './types';

type Tab = 'occupancy' | 'revenue' | 'reservations' | 'housekeeping' | 'cctv';

interface OccupancyDay {
  day: string;
  totalRooms: number;
  occupied: number;
  occupancyRate: number;
}

interface RevenueReport {
  from: string;
  to: string;
  daily: Array<{ day: string; revenue: number; expenses: number; net: number }>;
  byBranch: Array<{ branchId: string; branchName: string; revenue: number; expenses: number; net: number }>;
}

interface ReservationReport {
  from: string;
  to: string;
  total: number;
  cancellationRate: number;
  byStatus: Array<{ status: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
}

interface HousekeepingReport {
  from: string;
  to: string;
  byStatus: Array<{ status: string; count: number; avgMinutes: number }>;
  inspections: number;
  passRate: number;
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function ReportsPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? 'TZS';
  const [tab, setTab] = useState<Tab>('occupancy');
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [tick, setTick] = useState(0);
  const range = buildQuery({ from, to });

  const occupancy = useApi(
    () => (tab === 'occupancy' ? apiGet<{ days: OccupancyDay[] }>(`/api/reports/occupancy${range}`) : Promise.resolve({ days: [] })),
    [tab, range, tick]
  );
  const revenue = useApi(
    () => (tab === 'revenue' ? apiGet<RevenueReport>(`/api/reports/revenue${range}`) : Promise.resolve(null as RevenueReport | null)),
    [tab, range, tick]
  );
  const reservations = useApi(
    () => (tab === 'reservations' ? apiGet<ReservationReport>(`/api/reports/reservations${range}`) : Promise.resolve(null as ReservationReport | null)),
    [tab, range, tick]
  );
  const housekeeping = useApi(
    () => (tab === 'housekeeping' ? apiGet<HousekeepingReport>(`/api/reports/housekeeping${range}`) : Promise.resolve(null as HousekeepingReport | null)),
    [tab, range, tick]
  );
  const cctv = useApi(
    () => (tab === 'cctv' ? apiGet<CctvSummary>('/api/reports/cctv') : Promise.resolve(null as CctvSummary | null)),
    [tab, tick]
  );

  const active = tab === 'occupancy' ? occupancy : tab === 'revenue' ? revenue : tab === 'reservations' ? reservations : tab === 'housekeeping' ? housekeeping : cctv;

  return (
    <Page
      title="Reports"
      subtitle="Operational, occupancy and financial reporting from stored records."
      actions={
        <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => setTick((value) => value + 1)}>
          Refresh
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['occupancy', 'Occupancy'],
            ['revenue', 'Revenue'],
            ['reservations', 'Reservations'],
            ['housekeeping', 'Housekeeping'],
            ['cctv', 'CCTV activity'],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3.5 h-8 rounded-lg text-xs font-semibold border transition-colors ${
              tab === key ? 'bg-[#1769E8] text-white border-[#1769E8]' : 'bg-white text-[#5B6B82] border-[#E1EAF5] hover:border-[#1769E8]/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== 'cctv' && (
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="From" htmlFor="rep-from"><Input id="rep-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></FormField>
          <FormField label="To" htmlFor="rep-to"><Input id="rep-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></FormField>
        </div>
      )}

      {active.error && <ErrorBlock message={active.error} onRetry={active.reload} />}
      {active.loading && <LoadingBlock />}

      {!active.loading && !active.error && tab === 'occupancy' && (
        <Card title="Occupancy by day" subtitle="Occupied rooms divided by active rooms">
          {(occupancy.data?.days.length ?? 0) === 0 ? (
            <EmptyBlock title="No occupancy data" description="Add rooms and stays to populate this report." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-[#8EA2BC]">
                    <th className="py-2 pr-4">Day</th>
                    <th className="py-2 pr-4">Rooms</th>
                    <th className="py-2 pr-4">Occupied</th>
                    <th className="py-2 pr-4">Rate</th>
                    <th className="py-2 w-1/2">Visual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E1EAF5]">
                  {occupancy.data?.days.map((day) => (
                    <tr key={day.day}>
                      <td className="py-2 pr-4">{day.day}</td>
                      <td className="py-2 pr-4">{day.totalRooms}</td>
                      <td className="py-2 pr-4">{day.occupied}</td>
                      <td className="py-2 pr-4 font-semibold text-[#152B4A]">{day.occupancyRate}%</td>
                      <td className="py-2">
                        <div className="h-2 rounded-full bg-[#EAF3FF] overflow-hidden">
                          <div className="h-full bg-[#1769E8]" style={{ width: `${Math.min(100, day.occupancyRate)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {!active.loading && !active.error && tab === 'revenue' && revenue.data && (
        <>
          <Card title="Daily revenue and expenses" subtitle="Payments and expenses recorded per day">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-[#8EA2BC]">
                    <th className="py-2 pr-4">Day</th>
                    <th className="py-2 pr-4 text-right">Revenue</th>
                    <th className="py-2 pr-4 text-right">Expenses</th>
                    <th className="py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E1EAF5]">
                  {revenue.data.daily.map((day) => (
                    <tr key={day.day}>
                      <td className="py-2 pr-4">{day.day}</td>
                      <td className="py-2 pr-4 text-right">{money(day.revenue, currency)}</td>
                      <td className="py-2 pr-4 text-right">{money(day.expenses, currency)}</td>
                      <td className={`py-2 text-right font-semibold ${day.net < 0 ? 'text-[#B42318]' : 'text-[#0D7A54]'}`}>
                        {money(day.net, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="By branch" subtitle="Totals for the selected range">
            {revenue.data.byBranch.length === 0 ? (
              <p className="text-xs text-[#8EA2BC]">No branches configured.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {revenue.data.byBranch.map((row) => (
                  <div key={row.branchId} className="rounded-xl border border-[#E1EAF5] bg-[#F9FBFE] px-3 py-2 text-xs">
                    <p className="font-semibold text-[#152B4A]">{row.branchName}</p>
                    <p className="text-[10px] text-[#8EA2BC]">Revenue {money(row.revenue, currency)} · Net {money(row.net, currency)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {!active.loading && !active.error && tab === 'reservations' && reservations.data && (
        <Card title="Reservations" subtitle={`${reservations.data.total} reservation(s) in range · ${reservations.data.cancellationRate}% cancelled`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-semibold text-[#152B4A] mb-2">By status</p>
              {reservations.data.byStatus.length === 0 ? (
                <p className="text-xs text-[#8EA2BC]">No reservations in range.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {reservations.data.byStatus.map((row) => (
                    <li key={row.status} className="flex justify-between"><StatusBadge label={row.status} tone="info" /><span className="font-semibold">{row.count}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#152B4A] mb-2">By source</p>
              {reservations.data.bySource.length === 0 ? (
                <p className="text-xs text-[#8EA2BC]">No reservations in range.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {reservations.data.bySource.map((row) => (
                    <li key={row.source} className="flex justify-between"><span>{row.source}</span><span className="font-semibold">{row.count}</span></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {!active.loading && !active.error && tab === 'housekeeping' && housekeeping.data && (
        <Card title="Housekeeping" subtitle={`${housekeeping.data.inspections} inspection(s) · ${housekeeping.data.passRate}% pass rate`}>
          {housekeeping.data.byStatus.length === 0 ? (
            <EmptyBlock title="No housekeeping data" description="Tasks created in range will appear here." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {housekeeping.data.byStatus.map((row) => (
                <div key={row.status} className="rounded-xl border border-[#E1EAF5] bg-[#F9FBFE] px-3 py-2 text-xs">
                  <p className="font-semibold text-[#152B4A]">{row.status}</p>
                  <p className="text-[10px] text-[#8EA2BC]">{row.count} task(s) · avg {row.avgMinutes} min</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!active.loading && !active.error && tab === 'cctv' && cctv.data && (
        <Card title="CCTV activity" subtitle="Evidence recording — never a room status change">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-[#E1EAF5] bg-[#F9FBFE] px-3 py-3">
              <p className="text-[10px] uppercase tracking-wide text-[#8EA2BC]">Cameras</p>
              {Object.keys(cctv.data.cameras).length === 0 ? <p className="mt-1 text-[#8EA2BC]">None registered</p> : (
                <ul className="mt-1 space-y-0.5">{Object.entries(cctv.data.cameras).map(([status, count]) => <li key={status} className="flex justify-between"><span>{status}</span><strong>{count}</strong></li>)}</ul>
              )}
            </div>
            <div className="rounded-xl border border-[#E1EAF5] bg-[#F9FBFE] px-3 py-3">
              <p className="text-[10px] uppercase tracking-wide text-[#8EA2BC]">Analysis jobs</p>
              {Object.keys(cctv.data.analysisJobs).length === 0 ? <p className="mt-1 text-[#8EA2BC]">No jobs yet</p> : (
                <ul className="mt-1 space-y-0.5">{Object.entries(cctv.data.analysisJobs).map(([status, count]) => <li key={status} className="flex justify-between"><span>{status}</span><strong>{count}</strong></li>)}</ul>
              )}
            </div>
            <div className="rounded-xl border border-[#E1EAF5] bg-[#F9FBFE] px-3 py-3">
              <p className="text-[10px] uppercase tracking-wide text-[#8EA2BC]">Open alerts</p>
              <p className="mt-1 text-2xl font-bold text-[#152B4A]">{cctv.data.openAlerts}</p>
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 text-[11px] text-[#8EA2BC]">
        <BarChart3 className="w-3.5 h-3.5" />
        <span>Range requested: {dateOnly(from)} → {dateOnly(to)}. Empty ranges return zeroed series, not sample data.</span>
      </div>
    </Page>
  );
}
