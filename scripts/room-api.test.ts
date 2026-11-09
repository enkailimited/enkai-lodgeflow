/**
 * ENKAI LODGEFLOW — GATE 2.0 room API tests.
 *
 * Run with:  npm run test:rooms:api
 *
 * Requires a PostgreSQL database via TEST_DATABASE_URL (preferred) or
 * DATABASE_URL. The database is truncated between tests, so it must be a
 * dedicated test database.
 *
 * If no URL is configured the suite reports a skip instead of pretending to
 * pass — see the final report for what was actually executed.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import express from 'express';
import test, { after, before, beforeEach } from 'node:test';
import type { Server } from 'node:http';
import { closePool, getPool } from '../server/db/pool';
import { runMigrations } from '../server/db/migrate';
import { createRoomCategoriesRouter } from '../server/routes/roomCategories';
import { createRoomsRouter } from '../server/routes/rooms';
import { createRoomImportRouter } from '../server/routes/roomImport';

const DATABASE_URL = (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '').trim();

interface ApiResponse {
  status: number;
  body: any;
}

let baseUrl = '';
let server: Server | null = null;
let categoryId = '';

async function api(path: string, init: RequestInit = {}): Promise<ApiResponse> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
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

const iso = new Date('2026-11-03T09:00:00.000Z').toISOString();

function roomPayload(overrides: Record<string, unknown> = {}) {
  return {
    roomNumber: '901',
    name: 'Test Room',
    categoryId,
    floor: 'Floor 9 — Test Wing',
    capacity: 2,
    status: 'AVAILABLE',
    description: null,
    pricing: {
      hourlyRate: 25000,
      dailyRate: null,
      overnightRate: 150000,
      currency: 'TZS',
    },
    ...overrides,
  };
}

async function resetDatabase(): Promise<void> {
  await getPool().query(
    'TRUNCATE room_import_runs, rooms, room_categories RESTART IDENTITY CASCADE'
  );
}

async function registerTests(): Promise<void> {
  before(async () => {
    process.env.ROOM_ADMIN_TOKEN = 'test-admin-token';
    await runMigrations(DATABASE_URL);

    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api/rooms', createRoomsRouter());
    app.use('/api/room-categories', createRoomCategoriesRouter());
    app.use('/api/room-import', createRoomImportRouter());

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const listening = server;
    if (!listening) throw new Error('Test server failed to start.');
    const address = listening.address();
    if (!address || typeof address === 'string') throw new Error('Test server failed to bind.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    await resetDatabase();
    const created = await api('/api/room-categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Standard', description: 'Test category' }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    categoryId = created.body.data.category.id;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server?.close((error) => (error ? reject(error) : resolve()))
      );
    }
    await closePool();
  });

  test('creates, lists, updates and soft-deletes a room', async () => {
    const created = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(roomPayload()),
    });
    assert.equal(created.status, 201);
    const room = created.body.data.room;
    assert.equal(room.roomNumber, '901');
    assert.equal(room.pricing.hourlyRate, 25000);
    assert.equal(room.pricing.dailyRate, null);

    const listed = await api('/api/rooms');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.rooms.length, 1);

    const updated = await api(`/api/rooms/${room.id}`, {
      method: 'PATCH',
      body: JSON.stringify(roomPayload({ name: 'Renamed Room', capacity: 3 })),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.room.name, 'Renamed Room');
    assert.equal(updated.body.data.room.capacity, 3);

    const statusOnly = await api(`/api/rooms/${room.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CLEANING' }),
    });
    assert.equal(statusOnly.status, 200);
    assert.equal(statusOnly.body.data.room.status, 'CLEANING');

    const denied = await api(`/api/rooms/${room.id}`, { method: 'DELETE' });
    assert.equal(denied.status, 403);

    const deleted = await api(`/api/rooms/${room.id}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Token': 'test-admin-token' },
    });
    assert.equal(deleted.status, 204);

    const afterDelete = await api('/api/rooms');
    assert.equal(afterDelete.body.data.rooms.length, 0);
  });

  test('rejects duplicate room numbers case-insensitively', async () => {
    await api('/api/rooms', { method: 'POST', body: JSON.stringify(roomPayload()) });
    const duplicate = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(roomPayload({ roomNumber: ' 901 ' })),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'DUPLICATE_ROOM_NUMBER');
  });

  test('rejects duplicate category names case-insensitively', async () => {
    const duplicate = await api('/api/room-categories', {
      method: 'POST',
      body: JSON.stringify({ name: '  standard  ', description: null }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'DUPLICATE_CATEGORY_NAME');
  });

  test('rejects invalid capacity, pricing, status and category', async () => {
    const badCapacity = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(roomPayload({ capacity: 0 })),
    });
    assert.equal(badCapacity.status, 422);
    assert.ok(badCapacity.body.error.fieldErrors.capacity);

    const fractional = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(roomPayload({ capacity: 2.5 })),
    });
    assert.equal(fractional.status, 422);

    const negativeRate = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(
        roomPayload({ pricing: { hourlyRate: -1, dailyRate: null, overnightRate: null, currency: 'TZS' } })
      ),
    });
    assert.equal(negativeRate.status, 422);

    const tooPrecise = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(
        roomPayload({ pricing: { hourlyRate: 10.123, dailyRate: null, overnightRate: null, currency: 'TZS' } })
      ),
    });
    assert.equal(tooPrecise.status, 422);

    const badStatus = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(roomPayload({ status: 'SOLD_OUT' })),
    });
    assert.equal(badStatus.status, 422);

    const missingCategory = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(roomPayload({ categoryId: 'cat-missing' })),
    });
    assert.equal(missingCategory.status, 404);
    assert.equal(missingCategory.body.error.code, 'CATEGORY_NOT_FOUND');
  });

  test('keeps null pricing as "not configured"', async () => {
    const created = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(
        roomPayload({
          pricing: { hourlyRate: null, dailyRate: null, overnightRate: null, currency: 'TZS' },
        })
      ),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.data.room.pricing, {
      hourlyRate: null,
      dailyRate: null,
      overnightRate: null,
      currency: 'TZS',
    });
  });

  test('blocks category deletion while rooms reference it', async () => {
    await api('/api/rooms', { method: 'POST', body: JSON.stringify(roomPayload()) });
    const blocked = await api(`/api/room-categories/${categoryId}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Token': 'test-admin-token' },
    });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'CATEGORY_HAS_ROOMS');
  });

  test('destructive routes require the admin token', async () => {
    const created = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(roomPayload()),
    });
    const roomId = created.body.data.room.id;

    const wrong = await api(`/api/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Token': 'wrong-token' },
    });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.error.code, 'FORBIDDEN');
  });

  test('import previews, commits once, and never overwrites server data', async () => {
    const payload = {
      version: 1,
      updatedAt: iso,
      categories: [
        {
          id: 'cat-import',
          name: 'Imported Category',
          description: null,
          createdAt: iso,
          updatedAt: iso,
        },
      ],
      rooms: [
        {
          id: 'room-import-1',
          roomNumber: 'I-1',
          name: 'Imported Room',
          categoryId: 'cat-import',
          floor: 'Floor 1',
          capacity: 2,
          status: 'AVAILABLE',
          description: null,
          pricing: { hourlyRate: 10000, dailyRate: null, overnightRate: null, currency: 'TZS' },
          createdAt: iso,
          updatedAt: iso,
        },
      ],
    };

    const preview = await api('/api/room-import/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.data.categories.importable, 1);
    assert.equal(preview.body.data.rooms.importable, 1);

    const missingToken = await api('/api/room-import/commit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    assert.equal(missingToken.status, 403);

    const committed = await api('/api/room-import/commit', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'X-Admin-Token': 'test-admin-token' },
    });
    assert.equal(committed.status, 200, JSON.stringify(committed.body));
    assert.equal(committed.body.data.importedRooms, 1);
    assert.equal(committed.body.data.importedCategories, 1);

    const rooms = await api('/api/rooms');
    assert.equal(rooms.body.data.rooms[0].id, 'room-import-1');

    const repeated = await api('/api/room-import/commit', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'X-Admin-Token': 'test-admin-token' },
    });
    assert.equal(repeated.status, 409);
    assert.equal(repeated.body.error.code, 'IMPORT_ALREADY_APPLIED');

    const conflicting = structuredClone(payload);
    conflicting.rooms[0].name = 'Different Name';
    const conflictPreview = await api('/api/room-import/preview', {
      method: 'POST',
      body: JSON.stringify(conflicting),
    });
    assert.equal(conflictPreview.status, 200);
    assert.equal(conflictPreview.body.data.rooms.conflicts, 1);
    assert.equal(conflictPreview.body.data.rooms.importable, 0);
  });
}

if (!DATABASE_URL) {
  test('room API tests skipped — set TEST_DATABASE_URL or DATABASE_URL to run them', (t) => {
    t.skip('No PostgreSQL connection string configured.');
  });
} else {
  await registerTests();
}
