/**
 * Guests, reservations, stays and guest requests.
 *
 * Overlap protection is enforced twice: a pre-flight query for a friendly
 * message and a PostgreSQL exclusion constraint as the authoritative guard.
 */

import { randomUUID } from 'node:crypto';
import { getPool, withTransaction } from './pool';
import { RoomDbError } from './errors';

function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

export interface Guest {
  id: string;
  tenantId: string;
  branchId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  idType: string | null;
  idNumber: string | null;
  address: string | null;
  notes: string | null;
  preferences: Record<string, unknown>;
  marketingConsent: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapGuest(row: any): Guest {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    nationality: row.nationality,
    idType: row.id_type,
    idNumber: row.id_number,
    address: row.address,
    notes: row.notes,
    preferences: row.preferences ?? {},
    marketingConsent: row.marketing_consent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listGuests(
  tenantId: string,
  opts: { search?: string; limit?: number; offset?: number } = {}
): Promise<{ guests: Guest[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const search = (opts.search ?? '').trim();
  const like = `%${search}%`;

  const result = await getPool().query(
    `SELECT *, count(*) OVER()::int AS total
       FROM guests
      WHERE tenant_id = $1
        AND archived_at IS NULL
        AND ($2 = '' OR full_name ILIKE $3 OR coalesce(email,'') ILIKE $3 OR coalesce(phone,'') ILIKE $3)
      ORDER BY created_at DESC
      LIMIT $4 OFFSET $5`,
    [tenantId, search, like, limit, offset]
  );

  return {
    guests: result.rows.map(mapGuest),
    total: result.rows[0]?.total ?? 0,
  };
}

export async function getGuest(tenantId: string, id: string): Promise<Guest> {
  const result = await getPool().query(
    'SELECT * FROM guests WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL',
    [tenantId, id]
  );
  if (!result.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Guest not found.');
  return mapGuest(result.rows[0]);
}

export interface GuestInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  idType?: string | null;
  idNumber?: string | null;
  address?: string | null;
  notes?: string | null;
  marketingConsent?: boolean;
}

export async function createGuest(
  tenantId: string,
  branchId: string | null,
  input: GuestInput
): Promise<Guest> {
  const result = await getPool().query(
    `INSERT INTO guests
       (id, tenant_id, branch_id, full_name, email, phone, nationality, id_type, id_number,
        address, notes, marketing_consent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      newId('gst'), tenantId, branchId, input.fullName, input.email ?? null, input.phone ?? null,
      input.nationality ?? null, input.idType ?? null, input.idNumber ?? null,
      input.address ?? null, input.notes ?? null, Boolean(input.marketingConsent),
    ]
  );
  return mapGuest(result.rows[0]);
}

export async function updateGuest(
  tenantId: string,
  id: string,
  input: Partial<GuestInput>
): Promise<Guest> {
  const result = await getPool().query(
    `UPDATE guests SET
       full_name = COALESCE($3, full_name),
       email = COALESCE($4, email),
       phone = COALESCE($5, phone),
       nationality = COALESCE($6, nationality),
       id_type = COALESCE($7, id_type),
       id_number = COALESCE($8, id_number),
       address = COALESCE($9, address),
       notes = COALESCE($10, notes),
       marketing_consent = COALESCE($11, marketing_consent),
       updated_at = now()
     WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
     RETURNING *`,
    [
      tenantId, id, input.fullName ?? null, input.email ?? null, input.phone ?? null,
      input.nationality ?? null, input.idType ?? null, input.idNumber ?? null,
      input.address ?? null, input.notes ?? null,
      input.marketingConsent === undefined ? null : input.marketingConsent,
    ]
  );
  if (!result.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Guest not found.');
  return mapGuest(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

export interface Reservation {
  id: string;
  tenantId: string;
  branchId: string;
  guestId: string;
  guestName: string;
  roomId: string;
  roomNumber: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  source: string;
  rateAmount: number | null;
  ratePlan: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapReservation(row: any): Reservation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    guestId: row.guest_id,
    guestName: row.guest_name,
    roomId: row.room_id,
    roomNumber: row.room_number,
    status: row.status,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    adults: row.adults,
    children: row.children,
    source: row.source,
    rateAmount: row.rate_amount === null ? null : Number(row.rate_amount),
    ratePlan: row.rate_plan,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const RESERVATION_SELECT = `
  SELECT r.*, g.full_name AS guest_name, rm.room_number,
         r.check_in_date::text AS check_in_date,
         r.check_out_date::text AS check_out_date
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN rooms rm ON rm.id = r.room_id
`;

export async function listReservations(
  tenantId: string,
  opts: { branchId?: string | null; status?: string | null; from?: string | null; to?: string | null; guestId?: string | null; limit?: number; offset?: number } = {}
): Promise<{ reservations: Reservation[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 300);
  const offset = Math.max(opts.offset ?? 0, 0);

  const result = await getPool().query(
    `${RESERVATION_SELECT}
      WHERE r.tenant_id = $1
        AND ($2::text IS NULL OR r.branch_id = $2)
        AND ($3::text IS NULL OR r.status = $3)
        AND ($4::date IS NULL OR r.check_out_date > $4::date)
        AND ($5::date IS NULL OR r.check_in_date < $5::date)
        AND ($6::text IS NULL OR r.guest_id = $6)
      ORDER BY r.check_in_date DESC, r.created_at DESC
      LIMIT $7 OFFSET $8`,
    [tenantId, opts.branchId ?? null, opts.status ?? null, opts.from ?? null, opts.to ?? null, opts.guestId ?? null, limit, offset]
  );

  return { reservations: result.rows.map(mapReservation), total: result.rows.length };
}

export async function getReservation(tenantId: string, id: string): Promise<Reservation> {
  const result = await getPool().query(
    `${RESERVATION_SELECT} WHERE r.tenant_id = $1 AND r.id = $2`,
    [tenantId, id]
  );
  if (!result.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Reservation not found.');
  return mapReservation(result.rows[0]);
}

export interface ReservationInput {
  guestId: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  adults?: number;
  children?: number;
  source?: string;
  rateAmount?: number | null;
  ratePlan?: string | null;
  notes?: string | null;
  status?: 'PENDING' | 'CONFIRMED';
}

async function assertRoomAvailable(
  tenantId: string,
  roomId: string,
  checkIn: string,
  checkOut: string,
  excludeReservationId?: string
): Promise<void> {
  const room = await getPool().query(
    `SELECT id, status FROM rooms
      WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL`,
    [roomId, tenantId]
  );
  if (!room.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Room not found for this business.');
  if (['OUT_OF_SERVICE', 'MAINTENANCE'].includes(room.rows[0].status)) {
    throw new RoomDbError('INVALID_STATUS', 'That room is not bookable in its current state.');
  }

  const overlap = await getPool().query(
    `SELECT 1 FROM reservations
      WHERE tenant_id = $1 AND room_id = $2
        AND status = ANY($3::text[])
        AND daterange(check_in_date, check_out_date, '[)') && daterange($4::date, $5::date, '[)')
        AND ($6::text IS NULL OR id <> $6)
      LIMIT 1`,
    [tenantId, roomId, ACTIVE_RESERVATION_STATUSES, checkIn, checkOut, excludeReservationId ?? null]
  );
  if (overlap.rows[0]) {
    throw new RoomDbError('ROOM_HAS_ACTIVE_RESERVATIONS', 'That room is already reserved for an overlapping date range.');
  }
}

export async function createReservation(
  tenantId: string,
  branchId: string,
  userId: string,
  input: ReservationInput
): Promise<Reservation> {
  const guest = await getPool().query(
    'SELECT id FROM guests WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL',
    [input.guestId, tenantId]
  );
  if (!guest.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Guest not found for this business.');

  await assertRoomAvailable(tenantId, input.roomId, input.checkInDate, input.checkOutDate);

  const id = newId('res');
  try {
    await getPool().query(
      `INSERT INTO reservations
         (id, tenant_id, branch_id, guest_id, room_id, status, check_in_date, check_out_date,
          adults, children, source, rate_amount, rate_plan, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id, tenantId, branchId, input.guestId, input.roomId,
        input.status ?? 'CONFIRMED', input.checkInDate, input.checkOutDate,
        input.adults ?? 1, input.children ?? 0, input.source ?? 'DIRECT',
        input.rateAmount ?? null, input.ratePlan ?? null, input.notes ?? null, userId,
      ]
    );
  } catch (error: any) {
    if (error?.code === '23P01') {
      throw new RoomDbError('ROOM_HAS_ACTIVE_RESERVATIONS', 'That room is already reserved for an overlapping date range.');
    }
    if (error?.code === '23514') {
      throw new RoomDbError('INVALID_ROOM_DATA', 'Reservation dates or guest counts are invalid.');
    }
    throw error;
  }

  return getReservation(tenantId, id);
}

export async function updateReservation(
  tenantId: string,
  id: string,
  patch: Partial<ReservationInput> & { status?: Reservation['status'] }
): Promise<Reservation> {
  const current = await getReservation(tenantId, id);
  if (['CHECKED_OUT', 'CANCELLED'].includes(current.status)) {
    throw new RoomDbError('INVALID_STATUS', 'Completed or cancelled reservations cannot be edited.');
  }

  const checkIn = patch.checkInDate ?? current.checkInDate;
  const checkOut = patch.checkOutDate ?? current.checkOutDate;
  const roomId = patch.roomId ?? current.roomId;

  if (patch.checkInDate || patch.checkOutDate || patch.roomId) {
    await assertRoomAvailable(tenantId, roomId, checkIn, checkOut, id);
  }

  try {
    await getPool().query(
      `UPDATE reservations SET
         room_id = $3,
         check_in_date = $4,
         check_out_date = $5,
         adults = COALESCE($6, adults),
         children = COALESCE($7, children),
         source = COALESCE($8, source),
         rate_amount = COALESCE($9, rate_amount),
         rate_plan = COALESCE($10, rate_plan),
         notes = COALESCE($11, notes),
         status = COALESCE($12, status),
         updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [
        tenantId, id, roomId, checkIn, checkOut,
        patch.adults ?? null, patch.children ?? null, patch.source ?? null,
        patch.rateAmount ?? null, patch.ratePlan ?? null, patch.notes ?? null,
        patch.status ?? null,
      ]
    );
  } catch (error: any) {
    if (error?.code === '23P01') {
      throw new RoomDbError('ROOM_HAS_ACTIVE_RESERVATIONS', 'That room is already reserved for an overlapping date range.');
    }
    throw error;
  }

  return getReservation(tenantId, id);
}

export async function cancelReservation(
  tenantId: string,
  id: string,
  reason: string | null
): Promise<Reservation> {
  const result = await getPool().query(
    `UPDATE reservations
        SET status = 'CANCELLED', cancelled_at = now(), cancellation_reason = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status IN ('PENDING', 'CONFIRMED')
      RETURNING id`,
    [tenantId, id, reason]
  );
  if (!result.rows[0]) {
    throw new RoomDbError('INVALID_STATUS', 'Only pending or confirmed reservations can be cancelled.');
  }
  return getReservation(tenantId, id);
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export async function listAvailableRooms(
  tenantId: string,
  branchId: string,
  checkIn: string,
  checkOut: string
): Promise<any[]> {
  const result = await getPool().query(
    `SELECT rm.id, rm.room_number, rm.name, rm.floor, rm.capacity, rm.status,
            rm.category_id, rc.name AS category_name,
            rm.hourly_rate, rm.daily_rate, rm.overnight_rate, rm.currency
       FROM rooms rm
       LEFT JOIN room_categories rc ON rc.id = rm.category_id
      WHERE rm.tenant_id = $1
        AND ($2::text IS NULL OR rm.branch_id = $2)
        AND rm.archived_at IS NULL
        AND rm.status NOT IN ('OUT_OF_SERVICE', 'MAINTENANCE')
        AND NOT EXISTS (
          SELECT 1 FROM reservations r
           WHERE r.room_id = rm.id
             AND r.status = ANY($5::text[])
             AND daterange(r.check_in_date, r.check_out_date, '[)')
                 && daterange($3::date, $4::date, '[)')
        )
      ORDER BY rm.room_number`,
    [tenantId, branchId, checkIn, checkOut, ACTIVE_RESERVATION_STATUSES]
  );
  return result.rows.map((row) => ({
    id: row.id,
    roomNumber: row.room_number,
    name: row.name,
    floor: row.floor,
    capacity: row.capacity,
    status: row.status,
    categoryId: row.category_id,
    categoryName: row.category_name,
    pricing: {
      hourlyRate: row.hourly_rate === null ? null : Number(row.hourly_rate),
      dailyRate: row.daily_rate === null ? null : Number(row.daily_rate),
      overnightRate: row.overnight_rate === null ? null : Number(row.overnight_rate),
      currency: row.currency,
    },
  }));
}

// ---------------------------------------------------------------------------
// Check-in / check-out / stays
// ---------------------------------------------------------------------------

export interface GuestStay {
  id: string;
  tenantId: string;
  branchId: string;
  reservationId: string | null;
  guestId: string;
  guestName: string;
  roomId: string;
  roomNumber: string;
  status: string;
  checkInAt: string;
  checkOutAt: string | null;
  roomCharge: number | null;
}

const STAY_SELECT = `
  SELECT s.*, g.full_name AS guest_name, rm.room_number
    FROM guest_stays s
    JOIN guests g ON g.id = s.guest_id
    JOIN rooms rm ON rm.id = s.room_id
`;

function mapStay(row: any): GuestStay {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    reservationId: row.reservation_id,
    guestId: row.guest_id,
    guestName: row.guest_name,
    roomId: row.room_id,
    roomNumber: row.room_number,
    status: row.status,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    roomCharge: row.room_charge === null ? null : Number(row.room_charge),
  };
}

export async function listStays(
  tenantId: string,
  opts: { branchId?: string | null; status?: string | null; date?: string | null } = {}
): Promise<GuestStay[]> {
  const result = await getPool().query(
    `${STAY_SELECT}
      WHERE s.tenant_id = $1
        AND ($2::text IS NULL OR s.branch_id = $2)
        AND ($3::text IS NULL OR s.status = $3)
        AND ($4::date IS NULL OR s.check_in_at::date = $4::date)
      ORDER BY s.check_in_at DESC`,
    [tenantId, opts.branchId ?? null, opts.status ?? null, opts.date ?? null]
  );
  return result.rows.map(mapStay);
}

export async function checkIn(
  tenantId: string,
  branchId: string,
  userId: string,
  input: {
    reservationId?: string;
    guestId?: string;
    roomId?: string;
    roomCharge?: number | null;
    notes?: string | null;
  }
): Promise<GuestStay> {
  return withTransaction(async (client) => {
    let reservationId: string | null = null;
    let guestId = input.guestId ?? null;
    let roomId = input.roomId ?? null;
    let checkInAt = new Date();

    if (input.reservationId) {
      const reservation = await client.query(
        `SELECT * FROM reservations WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [input.reservationId, tenantId]
      );
      const row = reservation.rows[0];
      if (!row) throw new RoomDbError('ROOM_NOT_FOUND', 'Reservation not found.');
      if (row.status === 'CHECKED_IN') {
        throw new RoomDbError('INVALID_STATUS', 'This reservation is already checked in.');
      }
      if (row.status === 'CANCELLED' || row.status === 'NO_SHOW') {
        throw new RoomDbError('INVALID_STATUS', 'Cancelled or no-show reservations cannot be checked in.');
      }
      reservationId = row.id;
      guestId = row.guest_id;
      roomId = row.room_id;
    }

    if (!guestId) throw new RoomDbError('INVALID_ROOM_DATA', 'A guest is required for check-in.');
    if (!roomId) throw new RoomDbError('INVALID_ROOM_DATA', 'A room is required for check-in.');

    const room = await client.query(
      `SELECT id, status FROM rooms
        WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL FOR UPDATE`,
      [roomId, tenantId]
    );
    if (!room.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Room not found for this business.');
    if (['OUT_OF_SERVICE', 'MAINTENANCE'].includes(room.rows[0].status)) {
      throw new RoomDbError('INVALID_STATUS', 'That room cannot be occupied in its current state.');
    }

    const occupied = await client.query(
      `SELECT 1 FROM guest_stays WHERE room_id = $1 AND status = 'ACTIVE' LIMIT 1`,
      [roomId]
    );
    if (occupied.rows[0]) {
      throw new RoomDbError('ROOM_HAS_ACTIVE_RESERVATIONS', 'That room already has an active guest stay.');
    }

    const stayId = newId('stay');
    const inserted = await client.query(
      `INSERT INTO guest_stays
         (id, tenant_id, branch_id, reservation_id, guest_id, room_id, status,
          check_in_at, checked_in_by, room_charge, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8, $9, $10)
       RETURNING id`,
      [stayId, tenantId, branchId, reservationId, guestId, roomId, checkInAt, userId, input.roomCharge ?? null, input.notes ?? null]
    );

    if (reservationId) {
      await client.query(
        `UPDATE reservations SET status = 'CHECKED_IN', updated_at = now() WHERE id = $1`,
        [reservationId]
      );
    }

    await client.query(
      `UPDATE rooms SET status = 'OCCUPIED', updated_at = now() WHERE id = $1`,
      [roomId]
    );

    const stay = await client.query(`${STAY_SELECT} WHERE s.id = $1`, [inserted.rows[0].id]);
    return mapStay(stay.rows[0]);
  });
}

export interface CheckoutResult {
  stay: GuestStay;
  outstanding: number;
  housekeepingTaskId: string;
  cctvVerificationRequested: boolean;
}

export async function checkOut(
  tenantId: string,
  userId: string,
  input: { stayId?: string; roomId?: string; allowOutstanding?: boolean }
): Promise<CheckoutResult> {
  return withTransaction(async (client) => {
    const stayResult = await client.query(
      `SELECT * FROM guest_stays
        WHERE tenant_id = $1 AND status = 'ACTIVE'
          AND ($2::text IS NULL OR id = $2)
          AND ($3::text IS NULL OR room_id = $3)
        FOR UPDATE`,
      [tenantId, input.stayId ?? null, input.roomId ?? null]
    );
    const stayRow = stayResult.rows[0];
    if (!stayRow) throw new RoomDbError('ROOM_NOT_FOUND', 'No active stay found for that room.');

    const invoice = await client.query(
      `SELECT coalesce(sum(total), 0) AS total, coalesce(sum(amount_paid), 0) AS paid
         FROM invoices
        WHERE tenant_id = $1 AND stay_id = $2 AND status <> 'VOID'`,
      [tenantId, stayRow.id]
    );
    const outstanding = Number(invoice.rows[0].total) - Number(invoice.rows[0].paid);
    if (outstanding > 0.009 && !input.allowOutstanding) {
      throw new RoomDbError(
        'ROOM_HAS_ACTIVE_RESERVATIONS',
        `Guest has an outstanding balance of ${outstanding.toFixed(2)}. Settle it or authorise departure with balance.`
      );
    }

    const closed = await client.query(
      `UPDATE guest_stays
          SET status = 'CLOSED', check_out_at = now(), checked_out_by = $2
        WHERE id = $1
        RETURNING id`,
      [stayRow.id, userId]
    );

    if (stayRow.reservation_id) {
      await client.query(
        `UPDATE reservations SET status = 'CHECKED_OUT', updated_at = now() WHERE id = $1`,
        [stayRow.reservation_id]
      );
    }

    await client.query(
      `UPDATE rooms SET status = 'DIRTY', updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [stayRow.room_id, tenantId]
    );

    const taskId = newId('hk');
    await client.query(
      `INSERT INTO housekeeping_tasks
         (id, tenant_id, branch_id, room_id, stay_id, task_type, status, priority, created_by, notes)
       VALUES ($1, $2, $3, $4, $5, 'DEPARTURE', 'PENDING', 'NORMAL', $6, 'Auto-created at check-out')`,
      [taskId, tenantId, stayRow.branch_id, stayRow.room_id, stayRow.id, userId]
    );

    // CCTV may support verification, but it never performs the handover.
    const camera = await client.query(
      `SELECT id FROM cameras WHERE tenant_id = $1 AND room_id = $2 LIMIT 1`,
      [tenantId, stayRow.room_id]
    );
    let cctvVerificationRequested = false;
    if (camera.rows[0]) {
      await client.query(
        `INSERT INTO cctv_alerts
           (id, tenant_id, branch_id, camera_id, room_id, type, severity, message, status)
         VALUES ($1, $2, $3, $4, $5, 'OCCUPANCY_VERIFICATION_REQUESTED', 'INFO', $6, 'OPEN')`,
        [
          newId('alert'), tenantId, stayRow.branch_id, camera.rows[0].id, stayRow.room_id,
          'Check-out recorded. CCTV occupancy verification is available as supporting evidence only.',
        ]
      );
      cctvVerificationRequested = true;
    }

    const stay = await client.query(`${STAY_SELECT} WHERE s.id = $1`, [closed.rows[0].id]);

    return {
      stay: mapStay(stay.rows[0]),
      outstanding: Math.max(0, Math.round(outstanding * 100) / 100),
      housekeepingTaskId: taskId,
      cctvVerificationRequested,
    };
  });
}

// ---------------------------------------------------------------------------
// Guest history + requests
// ---------------------------------------------------------------------------

export async function guestHistory(tenantId: string, guestId: string): Promise<{
  reservations: Reservation[];
  stays: GuestStay[];
  outstanding: number;
}> {
  const reservations = await getPool().query(
    `${RESERVATION_SELECT} WHERE r.tenant_id = $1 AND r.guest_id = $2 ORDER BY r.check_in_date DESC`,
    [tenantId, guestId]
  );
  const stays = await getPool().query(
    `${STAY_SELECT} WHERE s.tenant_id = $1 AND s.guest_id = $2 ORDER BY s.check_in_at DESC`,
    [tenantId, guestId]
  );
  const outstanding = await getPool().query(
    `SELECT coalesce(sum(total - amount_paid), 0) AS balance
       FROM invoices
      WHERE tenant_id = $1 AND guest_id = $2 AND status IN ('ISSUED', 'PARTIALLY_PAID')`,
    [tenantId, guestId]
  );

  return {
    reservations: reservations.rows.map(mapReservation),
    stays: stays.rows.map(mapStay),
    outstanding: Number(outstanding.rows[0].balance),
  };
}

export async function listGuestRequests(tenantId: string, status?: string | null): Promise<any[]> {
  const result = await getPool().query(
    `SELECT gr.*, g.full_name AS guest_name
       FROM guest_requests gr
       LEFT JOIN guests g ON g.id = gr.guest_id
      WHERE gr.tenant_id = $1 AND ($2::text IS NULL OR gr.status = $2)
      ORDER BY gr.created_at DESC`,
    [tenantId, status ?? null]
  );
  return result.rows;
}

export async function createGuestRequest(
  tenantId: string,
  branchId: string,
  userId: string,
  input: { guestId?: string | null; stayId?: string | null; category?: string; description: string; priority?: string }
): Promise<any> {
  const result = await getPool().query(
    `INSERT INTO guest_requests
       (id, tenant_id, branch_id, guest_id, stay_id, category, description, status, priority, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8, $9)
     RETURNING *`,
    [
      newId('req'), tenantId, branchId, input.guestId ?? null, input.stayId ?? null,
      input.category ?? 'OTHER', input.description, input.priority ?? 'NORMAL', userId,
    ]
  );
  return result.rows[0];
}

export async function resolveGuestRequest(tenantId: string, id: string, status: string): Promise<any> {
  const result = await getPool().query(
    `UPDATE guest_requests
        SET status = $3, resolved_at = CASE WHEN $3 IN ('RESOLVED', 'CANCELLED') THEN now() ELSE NULL END
      WHERE tenant_id = $1 AND id = $2
      RETURNING *`,
    [tenantId, id, status]
  );
  if (!result.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Guest request not found.');
  return result.rows[0];
}
