/**
 * ENKAI LODGEFLOW — Phase 3 multi-tenant ERP API tests.
 *
 * Run with:  npm run test:erp:api
 *
 * Requires a DEDICATED test database via TEST_DATABASE_URL (preferred) or
 * DATABASE_URL. The database is truncated between tests, so never point this at
 * production. If no URL is configured the suite reports a skip instead of
 * pretending to pass.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import express from 'express';
import test, { after, before, beforeEach } from 'node:test';
import type { Server } from 'node:http';
import { closePool, getPool } from '../server/db/pool';
import { runMigrations } from '../server/db/migrate';
import { attachAuth } from '../server/middleware/auth';
import { createAuthRouter } from '../server/routes/auth';
import { createPlatformRouter } from '../server/routes/platform';
import { createBusinessRouter } from '../server/routes/business';
import { createBranchesRouter } from '../server/routes/branches';
import { createGuestsRouter } from '../server/routes/guests';
import { createReservationsRouter } from '../server/routes/reservations';
import { createFrontOfficeRouter } from '../server/routes/frontOffice';
import { createHousekeepingRouter } from '../server/routes/housekeeping';
import { createFinanceRouter } from '../server/routes/finance';
import { createStaffRouter } from '../server/routes/staff';
import { createReportsRouter } from '../server/routes/reports';
import { createCctvRouter } from '../server/routes/cctv';
import { createOccupancyRouter } from '../server/routes/occupancy';
import { createAuditRouter } from '../server/routes/audit';
import { createRoomsRouter } from '../server/routes/rooms';
import { createRoomCategoriesRouter } from '../server/routes/roomCategories';
import { createPlatformUser, createStaff, createTenant } from '../server/db/tenantStore';

const TEST_URL = (process.env.TEST_DATABASE_URL ?? '').trim();
const PRODUCTION_FALLBACK =
  (process.env.DATABASE_URL ?? '').toLowerCase().includes('_test')
    ? (process.env.DATABASE_URL ?? '').trim()
    : '';
const DATABASE_URL = TEST_URL || PRODUCTION_FALLBACK;

// The application pool reads DATABASE_URL. Point it at the dedicated test
// database so this destructive suite can never touch production data.
if (DATABASE_URL) process.env.DATABASE_URL = DATABASE_URL;

interface ApiResponse {
  status: number;
  body: any;
}

let baseUrl = '';
let server: Server | null = null;

let tenantA: { tenantId: string; branchId: string; ownerEmail: string };
let tenantB: { tenantId: string; branchId: string; ownerEmail: string };
let ownerAToken = '';
let ownerBToken = '';
let receptionistAToken = '';
let accountantAToken = '';
let platformToken = '';
let roomA = '';
let roomB = '';
let categoryA = '';
let guestA = '';
let guestB = '';

async function api(
  path: string,
  init: RequestInit = {},
  token?: string,
  extraHeaders: Record<string, string> = {}
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...extraHeaders,
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}

function loginBody(email: string, password: string): RequestInit {
  return { method: 'POST', body: JSON.stringify({ email, password }) };
}

async function login(email: string, password: string): Promise<string> {
  const result = await api('/api/auth/login', loginBody(email, password));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const setCookie = result.body?.data?.user ? null : null;
  void setCookie;
  // Login response does not echo the token (httpOnly cookie). Read it from the
  // Set-Cookie header by issuing a second call that captures headers.
  return result.body?.data?.token ?? '';
}

/** Login while capturing the Set-Cookie header (tests use Bearer tokens). */
async function loginWithToken(email: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, await response.text());
  const cookie = response.headers.get('set-cookie') ?? '';
  const match = /lodge_session=([a-f0-9]+)/.exec(cookie);
  assert.ok(match, `Expected a session cookie, received: ${cookie}`);
  return match[1];
}

async function resetDatabase(): Promise<void> {
  // DELETE (not TRUNCATE ... CASCADE) so the platform role catalog, which is
  // not owned by any tenant, survives.
  await getPool().query('DELETE FROM users');
  await getPool().query('DELETE FROM tenants');
}

async function seedTenant(name: string, slug: string, ownerEmail: string) {
  const created = await createTenant({
    name,
    slug,
    ownerName: `${name} Owner`,
    ownerEmail,
    ownerPassword: 'OwnerPass123!',
  });
  return {
    tenantId: created.tenant.id,
    branchId: created.branch.id,
    ownerEmail,
  };
}

async function createCategoryAndRoom(token: string, roomNumber: string): Promise<{
  categoryId: string;
  roomId: string;
}> {
  const category = await api(
    '/api/room-categories',
    { method: 'POST', body: JSON.stringify({ name: `Standard ${roomNumber}`, description: null }) },
    token
  );
  assert.equal(category.status, 201, JSON.stringify(category.body));
  const categoryId = category.body.data.category.id;

  const room = await api(
    '/api/rooms',
    {
      method: 'POST',
      body: JSON.stringify({
        roomNumber,
        name: `Room ${roomNumber}`,
        categoryId,
        floor: 'Ground',
        capacity: 2,
        status: 'AVAILABLE',
        description: null,
        pricing: { hourlyRate: 20000, dailyRate: 80000, overnightRate: 120000, currency: 'TZS' },
      }),
    },
    token
  );
  assert.equal(room.status, 201, JSON.stringify(room.body));
  return { categoryId, roomId: room.body.data.room.id };
}

async function createGuestRecord(token: string, fullName: string): Promise<string> {
  const created = await api(
    '/api/guests',
    { method: 'POST', body: JSON.stringify({ fullName, phone: '+255700000000' }) },
    token
  );
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.data.guest.id;
}

async function seedFixtures(): Promise<void> {
  await getPool().query('DELETE FROM users');
  await getPool().query('DELETE FROM tenants');

  await createPlatformUser({
    email: 'platform@test.local',
    displayName: 'Platform Test',
    password: 'PlatformPass123!',
    roleKey: 'PLATFORM_ADMIN',
  });

  tenantA = await seedTenant('Acacia Lodge', 'acacia-lodge', 'owner@acacia.test');
  tenantB = await seedTenant('Baobab Lodge', 'baobab-lodge', 'owner@baobab.test');

  ownerAToken = await loginWithToken(tenantA.ownerEmail, 'OwnerPass123!');
  ownerBToken = await loginWithToken(tenantB.ownerEmail, 'OwnerPass123!');
  platformToken = await loginWithToken('platform@test.local', 'PlatformPass123!');

  await createStaff(tenantA.tenantId, {
    email: 'reception@acacia.test',
    displayName: 'Reception',
    password: 'ReceptionPass123!',
    roleKey: 'RECEPTIONIST',
  });
  await createStaff(tenantA.tenantId, {
    email: 'accounts@acacia.test',
    displayName: 'Accounts',
    password: 'AccountsPass123!',
    roleKey: 'ACCOUNTANT',
  });
  receptionistAToken = await loginWithToken('reception@acacia.test', 'ReceptionPass123!');
  accountantAToken = await loginWithToken('accounts@acacia.test', 'AccountsPass123!');

  const a = await createCategoryAndRoom(ownerAToken, '101');
  categoryA = a.categoryId;
  roomA = a.roomId;
  const b = await createCategoryAndRoom(ownerBToken, '201');
  roomB = b.roomId;

  guestA = await createGuestRecord(ownerAToken, 'Alice Guest');
  guestB = await createGuestRecord(ownerBToken, 'Bob Guest');
}

/**
 * Clear transactional state between tests without recreating tenants, users or
 * sessions (each login costs several scrypt hashes plus remote round trips).
 * Sent as one simple query so the remote test database only pays one trip.
 */
async function resetTransactionalData(): Promise<void> {
  const ids = [tenantA.tenantId, tenantB.tenantId];
  const list = ids.map((id) => `'${id}'`).join(',');
  await getPool().query(`
    DELETE FROM cctv_alerts WHERE tenant_id IN (${list});
    DELETE FROM occupancy_states WHERE tenant_id IN (${list});
    DELETE FROM video_analysis_jobs WHERE tenant_id IN (${list});
    DELETE FROM video_recordings WHERE tenant_id IN (${list});
    DELETE FROM cameras WHERE tenant_id IN (${list});
    DELETE FROM payments WHERE tenant_id IN (${list});
    DELETE FROM invoices WHERE tenant_id IN (${list});
    DELETE FROM expenses WHERE tenant_id IN (${list});
    DELETE FROM room_inspections WHERE tenant_id IN (${list});
    DELETE FROM housekeeping_tasks WHERE tenant_id IN (${list});
    DELETE FROM guest_requests WHERE tenant_id IN (${list});
    DELETE FROM maintenance_requests WHERE tenant_id IN (${list});
    DELETE FROM guest_stays WHERE tenant_id IN (${list});
    DELETE FROM reservations WHERE tenant_id IN (${list});
    UPDATE rooms SET status = 'AVAILABLE' WHERE tenant_id IN (${list});
    DELETE FROM tenants WHERE id NOT IN (${list});
  `);
}

async function registerTests(): Promise<void> {
  before(async () => {
    await runMigrations(DATABASE_URL);

    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api', attachAuth);
    app.use('/api/auth', createAuthRouter());
    app.use('/api/platform', createPlatformRouter());
    app.use('/api/business', createBusinessRouter());
    app.use('/api/branches', createBranchesRouter());
    app.use('/api/guests', createGuestsRouter());
    app.use('/api/reservations', createReservationsRouter());
    app.use('/api/front-office', createFrontOfficeRouter());
    app.use('/api/housekeeping', createHousekeepingRouter());
    app.use('/api/finance', createFinanceRouter());
    app.use('/api/staff', createStaffRouter());
    app.use('/api/reports', createReportsRouter());
    app.use('/api/cctv', createCctvRouter());
    app.use('/api/occupancy', createOccupancyRouter());
    app.use('/api/audit-logs', createAuditRouter());
    app.use('/api/rooms', createRoomsRouter());
    app.use('/api/room-categories', createRoomCategoriesRouter());

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server?.address();
    if (!address || typeof address === 'string') throw new Error('Test server failed to bind.');
    baseUrl = `http://127.0.0.1:${address.port}`;

    await seedFixtures();
  });

  beforeEach(async () => {
    await resetTransactionalData();
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server?.close((error) => (error ? reject(error) : resolve()))
      );
    }
    await closePool();
  });

  test('unauthenticated access is rejected', async () => {
    for (const path of [
      '/api/rooms',
      '/api/guests',
      '/api/reservations',
      '/api/finance/invoices',
      '/api/cctv/cameras',
      '/api/reports/dashboard',
      '/api/platform/tenants',
    ]) {
      const result = await api(path);
      assert.equal(result.status, 401, `${path} should require authentication`);
    }
  });

  test('login rejects a wrong password and /me returns the identity', async () => {
    const bad = await api('/api/auth/login', loginBody(tenantA.ownerEmail, 'wrong-password'));
    assert.equal(bad.status, 401);

    const me = await api('/api/auth/me', {}, ownerAToken);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.email, tenantA.ownerEmail);
    assert.ok(me.body.data.user.permissions.includes('reservation.write'));
  });

  test('tenant isolation: business A cannot read or mutate tenant B data', async () => {
    const guests = await api('/api/guests?search=Bob', {}, ownerAToken);
    assert.equal(guests.status, 200);
    assert.equal(guests.body.data.total, 0);

    const guestBRead = await api(`/api/guests/${guestB}`, {}, ownerAToken);
    assert.equal(guestBRead.status, 404);

    const roomBRead = await api(`/api/rooms/${roomB}`, {}, ownerAToken);
    assert.equal(roomBRead.status, 404);

    const crossRoom = await api(
      '/api/reservations',
      {
        method: 'POST',
        body: JSON.stringify({
          guestId: guestA,
          roomId: roomB,
          checkInDate: '2026-12-01',
          checkOutDate: '2026-12-03',
        }),
      },
      ownerAToken
    );
    assert.equal(crossRoom.status, 404, JSON.stringify(crossRoom.body));

    const cameras = await api('/api/cctv/cameras', {}, ownerAToken);
    assert.equal(cameras.status, 200);
    assert.equal(cameras.body.data.cameras.length, 0);
  });

  test('role permissions are enforced on the backend', async () => {
    const finance = await api('/api/finance/invoices', {}, receptionistAToken);
    assert.equal(finance.status, 403);

    const staffCreate = await api(
      '/api/staff',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'x@acacia.test',
          displayName: 'X',
          password: 'Password123!',
          roleKey: 'OWNER',
        }),
      },
      receptionistAToken
    );
    assert.equal(staffCreate.status, 403);

    const invoice = await api('/api/finance/invoices', {}, accountantAToken);
    assert.equal(invoice.status, 200);

    const reservations = await api('/api/reservations', {}, receptionistAToken);
    assert.equal(reservations.status, 200);
  });

  test('reservations reject overlapping dates for the same room', async () => {
    const first = await api(
      '/api/reservations',
      {
        method: 'POST',
        body: JSON.stringify({
          guestId: guestA,
          roomId: roomA,
          checkInDate: '2026-12-10',
          checkOutDate: '2026-12-14',
        }),
      },
      ownerAToken
    );
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const overlapping = await api(
      '/api/reservations',
      {
        method: 'POST',
        body: JSON.stringify({
          guestId: guestA,
          roomId: roomA,
          checkInDate: '2026-12-13',
          checkOutDate: '2026-12-16',
        }),
      },
      ownerAToken
    );
    assert.equal(overlapping.status, 409, JSON.stringify(overlapping.body));

    // Back-to-back dates are allowed.
    const adjacent = await api(
      '/api/reservations',
      {
        method: 'POST',
        body: JSON.stringify({
          guestId: guestA,
          roomId: roomA,
          checkInDate: '2026-12-14',
          checkOutDate: '2026-12-16',
        }),
      },
      ownerAToken
    );
    assert.equal(adjacent.status, 201, JSON.stringify(adjacent.body));
  });

  test('check-in creates a stay and check-out closes it, dirties the room and creates housekeeping', async () => {
    const reservation = await api(
      '/api/reservations',
      {
        method: 'POST',
        body: JSON.stringify({
          guestId: guestA,
          roomId: roomA,
          checkInDate: '2026-12-20',
          checkOutDate: '2026-12-22',
        }),
      },
      ownerAToken
    );
    assert.equal(reservation.status, 201);
    const reservationId = reservation.body.data.reservation.id;

    const checkIn = await api(
      '/api/front-office/check-in',
      { method: 'POST', body: JSON.stringify({ reservationId }) },
      ownerAToken
    );
    assert.equal(checkIn.status, 201, JSON.stringify(checkIn.body));
    const stayId = checkIn.body.data.stay.id;

    const room = await api(`/api/rooms/${roomA}`, {}, ownerAToken);
    assert.equal(room.body.data.room.status, 'OCCUPIED');

    const checkout = await api(
      '/api/front-office/check-out',
      { method: 'POST', body: JSON.stringify({ stayId }) },
      ownerAToken
    );
    assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
    assert.equal(checkout.body.data.stay.status, 'CLOSED');
    assert.ok(checkout.body.data.housekeepingTaskId);

    const roomAfter = await api(`/api/rooms/${roomA}`, {}, ownerAToken);
    assert.equal(roomAfter.body.data.room.status, 'DIRTY');

    const tasks = await api('/api/housekeeping/tasks?status=PENDING', {}, ownerAToken);
    assert.equal(tasks.status, 200);
    assert.equal(tasks.body.data.tasks.length, 1);

    // A second check-out of the same stay must fail.
    const again = await api(
      '/api/front-office/check-out',
      { method: 'POST', body: JSON.stringify({ stayId }) },
      ownerAToken
    );
    assert.equal(again.status, 404);
  });

  test('housekeeping workflow moves the room from CLEANING to INSPECTION to READY', async () => {
    await api(
      '/api/front-office/check-in',
      { method: 'POST', body: JSON.stringify({ guestId: guestA, roomId: roomA }) },
      ownerAToken
    );
    await api(
      '/api/front-office/check-out',
      { method: 'POST', body: JSON.stringify({ roomId: roomA }) },
      ownerAToken
    );

    const tasks = await api('/api/housekeeping/tasks?status=PENDING', {}, ownerAToken);
    const taskId = tasks.body.data.tasks[0].id;

    const start = await api(
      `/api/housekeeping/tasks/${taskId}/start`,
      { method: 'POST', body: '{}' },
      ownerAToken
    );
    assert.equal(start.status, 200, JSON.stringify(start.body));
    let room = await api(`/api/rooms/${roomA}`, {}, ownerAToken);
    assert.equal(room.body.data.room.status, 'CLEANING');

    const submit = await api(
      `/api/housekeeping/tasks/${taskId}/submit`,
      { method: 'POST', body: '{}' },
      ownerAToken
    );
    assert.equal(submit.status, 200);
    room = await api(`/api/rooms/${roomA}`, {}, ownerAToken);
    assert.equal(room.body.data.room.status, 'INSPECTION');

    const inspect = await api(
      `/api/housekeeping/tasks/${taskId}/inspect`,
      { method: 'POST', body: JSON.stringify({ passed: true, notes: 'Spotless' }) },
      ownerAToken
    );
    assert.equal(inspect.status, 200, JSON.stringify(inspect.body));
    assert.equal(inspect.body.data.roomStatus, 'READY');

    const release = await api(
      `/api/housekeeping/rooms/${roomA}/ready`,
      { method: 'POST', body: '{}' },
      ownerAToken
    );
    assert.equal(release.status, 200);
    room = await api(`/api/rooms/${roomA}`, {}, ownerAToken);
    assert.equal(room.body.data.room.status, 'AVAILABLE');
  });

  test('finance: totals are server-computed, payments update status and overpayment is rejected', async () => {
    const invoice = await api(
      '/api/finance/invoices',
      {
        method: 'POST',
        body: JSON.stringify({
          guestId: guestA,
          items: [
            { description: 'Room charge', quantity: 2, unitPrice: 100000 },
            { description: 'Breakfast', quantity: 1, unitPrice: 20000 },
          ],
          taxRate: 10,
        }),
      },
      accountantAToken
    );
    assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
    const created = invoice.body.data.invoice;
    assert.equal(created.subtotal, 220000);
    assert.equal(created.tax, 22000);
    assert.equal(created.total, 242000);
    assert.equal(created.status, 'ISSUED');

    const overpay = await api(
      '/api/finance/payments',
      {
        method: 'POST',
        body: JSON.stringify({ invoiceId: created.id, amount: 300000, method: 'CASH' }),
      },
      accountantAToken
    );
    assert.equal(overpay.status, 422, JSON.stringify(overpay.body));

    const partial = await api(
      '/api/finance/payments',
      {
        method: 'POST',
        body: JSON.stringify({ invoiceId: created.id, amount: 100000, method: 'MOBILE_MONEY' }),
      },
      accountantAToken
    );
    assert.equal(partial.status, 200, JSON.stringify(partial.body));
    assert.equal(partial.body.data.invoice.status, 'PARTIALLY_PAID');
    assert.equal(partial.body.data.invoice.balance, 142000);

    const rest = await api(
      '/api/finance/payments',
      {
        method: 'POST',
        body: JSON.stringify({ invoiceId: created.id, amount: 142000, method: 'CASH' }),
      },
      accountantAToken
    );
    assert.equal(rest.status, 200);
    assert.equal(rest.body.data.invoice.status, 'PAID');

    const summary = await api('/api/finance/summary', {}, accountantAToken);
    assert.equal(summary.status, 200);
    assert.equal(summary.body.data.summary.revenue, 242000);
  });

  test('dashboard reports real counts and empty states rather than sample data', async () => {
    const dashboard = await api('/api/reports/dashboard', {}, ownerAToken);
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.data.rooms.total, 1);
    assert.equal(dashboard.body.data.rooms.available, 1);
    assert.equal(dashboard.body.data.currentGuests, 0);
    assert.equal(dashboard.body.data.revenueToday, 0);
    assert.deepEqual(dashboard.body.data.recentCheckIns, []);
    assert.deepEqual(dashboard.body.data.recentCheckOuts, []);
  });

  test('platform admin manages tenants; tenant access requires explicit elevation', async () => {
    const tenants = await api('/api/platform/tenants', {}, platformToken);
    assert.equal(tenants.status, 200);
    assert.equal(tenants.body.data.tenants.length, 2);

    const created = await api(
      '/api/platform/tenants',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Cedar Lodge',
          slug: 'cedar-lodge',
          ownerName: 'Cedar Owner',
          ownerEmail: 'owner@cedar.test',
          ownerPassword: 'CedarPass123!',
        }),
      },
      platformToken
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const cedarId = created.body.data.tenant.id;

    // Platform staff cannot read business data without naming a tenant.
    const noTenant = await api('/api/reports/dashboard', {}, platformToken);
    assert.equal(noTenant.status, 400);

    // With explicit elevation the read succeeds and is audited.
    const elevated = await api('/api/reports/dashboard', {}, platformToken, {
      'x-tenant-id': cedarId,
    });
    assert.equal(elevated.status, 200);
    assert.equal(elevated.body.data.rooms.total, 0);

    const audits = await api(`/api/audit-logs?tenantId=${cedarId}`, {}, platformToken);
    assert.equal(audits.status, 200);
    assert.ok(
      audits.body.data.logs.some((log: any) => log.action === 'platform.tenant.elevate'),
      'Elevation must be audited'
    );

    // Suspending a tenant blocks its users immediately.
    await api(
      `/api/platform/tenants/${cedarId}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'SUSPENDED' }) },
      platformToken
    );
    const blocked = await api('/api/auth/login', loginBody('owner@cedar.test', 'CedarPass123!'));
    assert.equal(blocked.status, 403);
  });

  test('business users cannot reach platform endpoints', async () => {
    const result = await api('/api/platform/tenants', {}, ownerAToken);
    assert.equal(result.status, 403);
  });

  test('CCTV cameras are tenant-scoped and cross-tenant edits are rejected', async () => {
    const created = await api(
      '/api/cctv/cameras',
      {
        method: 'POST',
        body: JSON.stringify({ name: 'Entrance Cam', location: 'Lobby', roomId: roomA }),
      },
      ownerAToken
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const cameraId = created.body.data.camera.id;

    const listA = await api('/api/cctv/cameras', {}, ownerAToken);
    assert.equal(listA.body.data.cameras.length, 1);

    const listB = await api('/api/cctv/cameras', {}, ownerBToken);
    assert.equal(listB.body.data.cameras.length, 0);

    const crossPatch = await api(
      `/api/cctv/cameras/${cameraId}`,
      { method: 'PATCH', body: JSON.stringify({ name: 'Hijacked' }) },
      ownerBToken
    );
    assert.equal(crossPatch.status, 404);

    const crossRead = await api(`/api/cctv/cameras`, {}, ownerBToken);
    assert.equal(crossRead.body.data.cameras.length, 0);
  });

  test('check-out requests CCTV verification only when a camera is mapped', async () => {
    await api(
      '/api/cctv/cameras',
      {
        method: 'POST',
        body: JSON.stringify({ name: 'Room Cam', roomId: roomA }),
      },
      ownerAToken
    );
    await api(
      '/api/front-office/check-in',
      { method: 'POST', body: JSON.stringify({ guestId: guestA, roomId: roomA }) },
      ownerAToken
    );
    const checkout = await api(
      '/api/front-office/check-out',
      { method: 'POST', body: JSON.stringify({ roomId: roomA }) },
      ownerAToken
    );
    assert.equal(checkout.status, 200);
    assert.equal(checkout.body.data.cctvVerificationRequested, true);

    // The room lifecycle still follows housekeeping, never the camera.
    const room = await api(`/api/rooms/${roomA}`, {}, ownerAToken);
    assert.equal(room.body.data.room.status, 'DIRTY');

    const alerts = await api('/api/cctv/alerts?status=OPEN', {}, ownerAToken);
    assert.ok(
      alerts.body.data.alerts.some(
        (alert: any) => alert.type === 'OCCUPANCY_VERIFICATION_REQUESTED'
      )
    );
  });
}

if (!DATABASE_URL) {
  test('ERP API tests require TEST_DATABASE_URL or DATABASE_URL', (t) => {
    t.skip('No database configured; suite skipped rather than faked.');
  });
} else {
  registerTests();
}

void login;
