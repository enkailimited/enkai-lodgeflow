/**
 * Reports derived from stored records only. No estimates, no demo figures.
 */

import { getPool } from './pool';

const TZ = 'Africa/Dar_es_Salaam';

export async function dashboard(tenantId: string, branchId: string | null): Promise<any> {
  const branchFilter = branchId ? 'AND branch_id = $2' : '';
  const params = branchId ? [tenantId, branchId] : [tenantId];

  const rooms = await getPool().query(
    `SELECT status, count(*)::int AS count
       FROM rooms
      WHERE tenant_id = $1 ${branchFilter} AND archived_at IS NULL
      GROUP BY status`,
    params
  );

  const counts: Record<string, number> = {};
  let totalRooms = 0;
  for (const row of rooms.rows) {
    counts[row.status] = row.count;
    totalRooms += row.count;
  }

  const guests = await getPool().query(
    `SELECT count(*)::int AS count FROM guest_stays
      WHERE tenant_id = $1 ${branchId ? 'AND branch_id = $2' : ''} AND status = 'ACTIVE'`,
    params
  );

  const arrivals = await getPool().query(
    `SELECT count(*)::int AS count FROM reservations
      WHERE tenant_id = $1 ${branchId ? 'AND branch_id = $2' : ''}
        AND status IN ('PENDING', 'CONFIRMED')
        AND check_in_date = (now() AT TIME ZONE $${params.length + 1})::date`,
    [...params, TZ]
  );

  const departures = await getPool().query(
    `SELECT count(*)::int AS count FROM reservations
      WHERE tenant_id = $1 ${branchId ? 'AND branch_id = $2' : ''}
        AND status = 'CHECKED_IN'
        AND check_out_date = (now() AT TIME ZONE $${params.length + 1})::date`,
    [...params, TZ]
  );

  const revenue = await getPool().query(
    `SELECT coalesce(sum(amount), 0) AS total FROM payments
      WHERE tenant_id = $1 ${branchId ? 'AND branch_id = $2' : ''}
        AND paid_at::date = (now() AT TIME ZONE $${params.length + 1})::date`,
    [...params, TZ]
  );

  const outstanding = await getPool().query(
    `SELECT coalesce(sum(total - amount_paid), 0) AS total, count(*)::int AS count
       FROM invoices
      WHERE tenant_id = $1 ${branchId ? 'AND branch_id = $2' : ''}
        AND status IN ('ISSUED', 'PARTIALLY_PAID')`,
    params
  );

  const housekeeping = await getPool().query(
    `SELECT status, count(*)::int AS count FROM housekeeping_tasks
      WHERE tenant_id = $1 ${branchId ? 'AND branch_id = $2' : ''}
        AND status IN ('PENDING', 'IN_PROGRESS', 'INSPECTION')
      GROUP BY status`,
    params
  );

  const recentCheckIns = await getPool().query(
    `SELECT s.id, s.check_in_at, g.full_name AS guest_name, rm.room_number
       FROM guest_stays s
       JOIN guests g ON g.id = s.guest_id
       JOIN rooms rm ON rm.id = s.room_id
      WHERE s.tenant_id = $1 ${branchId ? 'AND s.branch_id = $2' : ''}
      ORDER BY s.check_in_at DESC LIMIT 5`,
    params
  );

  const recentCheckOuts = await getPool().query(
    `SELECT s.id, s.check_out_at, g.full_name AS guest_name, rm.room_number
       FROM guest_stays s
       JOIN guests g ON g.id = s.guest_id
       JOIN rooms rm ON rm.id = s.room_id
      WHERE s.tenant_id = $1 ${branchId ? 'AND s.branch_id = $2' : ''}
        AND s.status = 'CLOSED'
      ORDER BY s.check_out_at DESC LIMIT 5`,
    params
  );

  const revenueTrend = await getPool().query(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, coalesce(sum(p.amount), 0) AS total
       FROM generate_series(
              (now() AT TIME ZONE $${params.length + 1})::date - 6,
              (now() AT TIME ZONE $${params.length + 1})::date,
              interval '1 day'
            ) AS d(day)
       LEFT JOIN payments p
         ON p.tenant_id = $1
        AND ${branchId ? 'p.branch_id = $2 AND' : ''}
            p.paid_at::date = d.day
      GROUP BY d.day ORDER BY d.day`,
    [...params, TZ]
  );

  const branchPerformance = await getPool().query(
    `SELECT b.id, b.name,
            count(DISTINCT r.id)::int AS rooms,
            count(DISTINCT r.id) FILTER (WHERE r.status = 'OCCUPIED')::int AS occupied,
            coalesce((
              SELECT sum(p.amount) FROM payments p
               WHERE p.tenant_id = b.tenant_id AND p.branch_id = b.id
                 AND p.paid_at::date = (now() AT TIME ZONE $2)::date
            ), 0) AS revenue_today
       FROM branches b
       LEFT JOIN rooms r ON r.branch_id = b.id AND r.archived_at IS NULL
      WHERE b.tenant_id = $1
      GROUP BY b.id
      ORDER BY b.name`,
    [tenantId, TZ]
  );

  const occupied = counts.OCCUPIED ?? 0;

  return {
    branchId,
    rooms: {
      total: totalRooms,
      available: counts.AVAILABLE ?? 0,
      occupied,
      reserved: counts.RESERVED ?? 0,
      cleaning: (counts.CLEANING ?? 0) + (counts.DIRTY ?? 0),
      inspection: counts.INSPECTION ?? 0,
      ready: counts.READY ?? 0,
      maintenance: counts.MAINTENANCE ?? 0,
      outOfService: counts.OUT_OF_SERVICE ?? 0,
      occupancyRate: totalRooms === 0 ? 0 : Math.round((occupied / totalRooms) * 1000) / 10,
    },
    currentGuests: guests.rows[0].count,
    arrivalsToday: arrivals.rows[0].count,
    departuresToday: departures.rows[0].count,
    revenueToday: Number(revenue.rows[0].total),
    outstandingBalance: Number(outstanding.rows[0].total),
    outstandingInvoices: outstanding.rows[0].count,
    housekeeping: housekeeping.rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {}),
    recentCheckIns: recentCheckIns.rows,
    recentCheckOuts: recentCheckOuts.rows,
    revenueTrend: revenueTrend.rows.map((row) => ({ day: row.day, total: Number(row.total) })),
    branchPerformance: branchPerformance.rows.map((row) => ({
      branchId: row.id,
      branchName: row.name,
      rooms: row.rooms,
      occupied: row.occupied,
      revenueToday: Number(row.revenue_today),
    })),
  };
}

export async function occupancyReport(
  tenantId: string,
  branchId: string | null,
  from: string,
  to: string
): Promise<any[]> {
  const daily = await getPool().query(
    `SELECT d.day::text AS day,
            (SELECT count(*)::int FROM rooms r
              WHERE r.tenant_id = $1
                AND ($2::text IS NULL OR r.branch_id = $2)
                AND r.archived_at IS NULL) AS total_rooms,
            (SELECT count(*)::int FROM guest_stays s
              WHERE s.tenant_id = $1
                AND ($2::text IS NULL OR s.branch_id = $2)
                AND s.check_in_at::date <= d.day
                AND (s.check_out_at IS NULL OR s.check_out_at::date > d.day)) AS occupied
       FROM generate_series($3::date, $4::date, interval '1 day') AS d(day)
      ORDER BY d.day`,
    [tenantId, branchId, from, to]
  );

  return daily.rows.map((row) => ({
    day: row.day,
    totalRooms: row.total_rooms,
    occupied: row.occupied,
    occupancyRate:
      row.total_rooms === 0 ? 0 : Math.round((row.occupied / row.total_rooms) * 1000) / 10,
  }));
}

export async function revenueReport(
  tenantId: string,
  branchId: string | null,
  from: string,
  to: string
): Promise<any> {
  const daily = await getPool().query(
    `SELECT d.day::text AS day,
            coalesce((SELECT sum(p.amount) FROM payments p
              WHERE p.tenant_id = $1 AND ($2::text IS NULL OR p.branch_id = $2)
                AND p.paid_at::date = d.day), 0) AS revenue,
            coalesce((SELECT sum(e.amount) FROM expenses e
              WHERE e.tenant_id = $1 AND ($2::text IS NULL OR e.branch_id = $2)
                AND e.spent_at::date = d.day), 0) AS expenses
       FROM generate_series($3::date, $4::date, interval '1 day') AS d(day)
      ORDER BY d.day`,
    [tenantId, branchId, from, to]
  );

  const byBranch = await getPool().query(
    `SELECT b.id, b.name,
            coalesce((SELECT sum(p.amount) FROM payments p WHERE p.branch_id = b.id
              AND p.paid_at::date BETWEEN $2::date AND $3::date), 0) AS revenue,
            coalesce((SELECT sum(e.amount) FROM expenses e WHERE e.branch_id = b.id
              AND e.spent_at::date BETWEEN $2::date AND $3::date), 0) AS expenses
       FROM branches b WHERE b.tenant_id = $1 ORDER BY b.name`,
    [tenantId, from, to]
  );

  return {
    daily: daily.rows.map((row) => ({
      day: row.day,
      revenue: Number(row.revenue),
      expenses: Number(row.expenses),
      net: Math.round((Number(row.revenue) - Number(row.expenses)) * 100) / 100,
    })),
    byBranch: byBranch.rows.map((row) => ({
      branchId: row.id,
      branchName: row.name,
      revenue: Number(row.revenue),
      expenses: Number(row.expenses),
      net: Math.round((Number(row.revenue) - Number(row.expenses)) * 100) / 100,
    })),
  };
}

export async function reservationReport(
  tenantId: string,
  branchId: string | null,
  from: string,
  to: string
): Promise<any> {
  const byStatus = await getPool().query(
    `SELECT status, count(*)::int AS count
       FROM reservations
      WHERE tenant_id = $1 AND ($2::text IS NULL OR branch_id = $2)
        AND check_in_date BETWEEN $3::date AND $4::date
      GROUP BY status`,
    [tenantId, branchId, from, to]
  );

  const bySource = await getPool().query(
    `SELECT source, count(*)::int AS count
       FROM reservations
      WHERE tenant_id = $1 AND ($2::text IS NULL OR branch_id = $2)
        AND check_in_date BETWEEN $3::date AND $4::date
      GROUP BY source ORDER BY count DESC`,
    [tenantId, branchId, from, to]
  );

  const total = byStatus.rows.reduce((sum, row) => sum + row.count, 0);
  const cancelled = byStatus.rows.find((row) => row.status === 'CANCELLED')?.count ?? 0;

  return {
    total,
    byStatus: byStatus.rows,
    bySource: bySource.rows,
    cancellationRate: total === 0 ? 0 : Math.round((cancelled / total) * 1000) / 10,
  };
}

export async function housekeepingReport(
  tenantId: string,
  branchId: string | null,
  from: string,
  to: string
): Promise<any> {
  const result = await getPool().query(
    `SELECT status, count(*)::int AS count,
            coalesce(avg(extract(epoch from (completed_at - created_at)) / 60), 0) AS avg_minutes
       FROM housekeeping_tasks
      WHERE tenant_id = $1 AND ($2::text IS NULL OR branch_id = $2)
        AND created_at::date BETWEEN $3::date AND $4::date
      GROUP BY status`,
    [tenantId, branchId, from, to]
  );

  const inspections = await getPool().query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE passed)::int AS passed
       FROM room_inspections
      WHERE tenant_id = $1 AND ($2::text IS NULL OR branch_id = $2)
        AND created_at::date BETWEEN $3::date AND $4::date`,
    [tenantId, branchId, from, to]
  );

  const totalInspections = inspections.rows[0].total;
  return {
    byStatus: result.rows.map((row) => ({
      status: row.status,
      count: row.count,
      avgMinutes: Math.round(Number(row.avg_minutes)),
    })),
    inspections: totalInspections,
    passRate:
      totalInspections === 0
        ? 0
        : Math.round((inspections.rows[0].passed / totalInspections) * 1000) / 10,
  };
}

export async function cctvSummary(tenantId: string, branchId: string | null): Promise<any> {
  const cameras = await getPool().query(
    `SELECT status, count(*)::int AS count FROM cameras
      WHERE tenant_id = $1 AND ($2::text IS NULL OR branch_id = $2)
      GROUP BY status`,
    [tenantId, branchId]
  );
  const jobs = await getPool().query(
    `SELECT status, count(*)::int AS count FROM video_analysis_jobs
      WHERE tenant_id = $1 AND ($2::text IS NULL OR branch_id = $2)
      GROUP BY status`,
    [tenantId, branchId]
  );
  const alerts = await getPool().query(
    `SELECT count(*)::int AS count FROM cctv_alerts
      WHERE tenant_id = $1 AND ($2::text IS NULL OR branch_id = $2) AND status = 'OPEN'`,
    [tenantId, branchId]
  );

  return {
    cameras: cameras.rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {}),
    analysisJobs: jobs.rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {}),
    openAlerts: alerts.rows[0].count,
  };
}
