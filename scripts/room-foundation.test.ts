/**
 * ENKAI LODGEFLOW — PHASE 1 room foundation tests.
 *
 * Run with:  npm run test:rooms
 * Uses Node's built-in test runner via tsx (no new test framework added).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemoryStorage,
  LocalRoomRepository,
  RoomRepositoryError,
} from '../src/data/roomRepository';
import {
  countRoomsByStatus,
  findDuplicateCategoryName,
  formatTzs,
  parseCapacity,
  parseOptionalPrice,
  validatePricing,
} from '../src/data/roomValidation';
import { ROOM_STATUSES, RoomInput } from '../src/types/room';

const validRoomInput: RoomInput = {
  roomNumber: '900',
  name: 'Test Room',
  categoryId: 'cat-standard',
  floor: 'Floor 9 — Test Wing',
  capacity: 2,
  status: 'AVAILABLE',
  description: null,
  pricing: { hourlyRate: 10000, dailyRate: null, overnightRate: null, currency: 'TZS' },
};

function newRepository() {
  return new LocalRoomRepository({ storage: createMemoryStorage(), latencyMs: 0 });
}

test('status identifiers match the Phase 1 contract', () => {
  assert.deepEqual(ROOM_STATUSES, [
    'AVAILABLE',
    'OCCUPIED',
    'RESERVED',
    'CLEANING',
    'MAINTENANCE',
    'OUT_OF_SERVICE',
  ]);
});

test('optional price parsing accepts blanks, zero and decimals but rejects negatives', () => {
  assert.deepEqual(parseOptionalPrice(''), { value: null, error: null });
  assert.deepEqual(parseOptionalPrice('   '), { value: null, error: null });
  assert.deepEqual(parseOptionalPrice('0'), { value: 0, error: null });
  assert.deepEqual(parseOptionalPrice('25000'), { value: 25000, error: null });
  assert.deepEqual(parseOptionalPrice('1250.5'), { value: 1250.5, error: null });

  assert.equal(parseOptionalPrice('-1').value, null);
  assert.ok(parseOptionalPrice('-1').error);
  assert.equal(parseOptionalPrice('abc').value, null);
  assert.ok(parseOptionalPrice('abc').error);
  assert.ok(parseOptionalPrice('1e5').error);
});

test('capacity parsing enforces whole numbers between 1 and 20', () => {
  assert.deepEqual(parseCapacity('2'), { value: 2, error: null });
  assert.ok(parseCapacity('0').error);
  assert.ok(parseCapacity('2.5').error);
  assert.ok(parseCapacity('abc').error);
  assert.ok(parseCapacity('21').error);
  assert.ok(parseCapacity('').error);
});

test('pricing validation rejects negative or invalid rates and keeps nulls unconfigured', () => {
  assert.equal(
    validatePricing({ hourlyRate: null, dailyRate: null, overnightRate: null, currency: 'TZS' }),
    null
  );
  assert.equal(
    validatePricing({ hourlyRate: 0, dailyRate: 1000, overnightRate: null, currency: 'TZS' }),
    null
  );
  assert.ok(
    validatePricing({ hourlyRate: -5, dailyRate: null, overnightRate: null, currency: 'TZS' })
  );
  assert.ok(
    validatePricing({
      hourlyRate: Number.POSITIVE_INFINITY,
      dailyRate: null,
      overnightRate: null,
      currency: 'TZS',
    })
  );
});

test('TZS formatting marks unconfigured rates instead of showing zero', () => {
  assert.equal(formatTzs(null), 'Not configured');
  const formatted = formatTzs(25000);
  assert.ok(formatted.includes('TZS'), `expected currency code in "${formatted}"`);
  assert.ok(formatted.includes('25,000'), `expected grouped amount in "${formatted}"`);
});

test('repository seeds demo data exactly once per storage', async () => {
  const storage = createMemoryStorage();
  const repo = new LocalRoomRepository({ storage, latencyMs: 0 });

  const rooms = await repo.listRooms();
  const categories = await repo.listCategories();

  assert.equal(rooms.length, 12);
  assert.equal(categories.length, 4);
  assert.ok(rooms.every((room) => room.pricing.currency === 'TZS'));
  assert.ok(rooms.some((room) => room.pricing.dailyRate === null));

  // A second repository over the same storage must not reseed/duplicate.
  const secondRepo = new LocalRoomRepository({ storage, latencyMs: 0 });
  assert.equal((await secondRepo.listRooms()).length, 12);
});

test('countRoomsByStatus derives dashboard figures from actual records', async () => {
  const repo = newRepository();
  const rooms = await repo.listRooms();
  const counts = countRoomsByStatus(rooms);

  assert.equal(counts.total, rooms.length);
  assert.equal(
    counts.available +
      counts.occupied +
      counts.reserved +
      counts.cleaning +
      counts.maintenance +
      counts.outOfService,
    counts.total
  );
  assert.equal(counts.maintenance, 1);
  assert.equal(counts.outOfService, 1);
});

test('creating a room persists it for future reads', async () => {
  const storage = createMemoryStorage();
  const repo = new LocalRoomRepository({ storage, latencyMs: 0 });

  const created = await repo.createRoom(validRoomInput);
  assert.ok(created.id);
  assert.equal(created.roomNumber, '900');
  assert.equal(created.pricing.hourlyRate, 10000);
  assert.equal(created.pricing.dailyRate, null);

  const reloaded = new LocalRoomRepository({ storage, latencyMs: 0 });
  const rooms = await reloaded.listRooms();
  assert.equal(rooms.length, 13);
  assert.ok(rooms.some((room) => room.id === created.id));
});

test('duplicate room numbers are rejected regardless of case and spacing', async () => {
  const repo = newRepository();
  await repo.createRoom({ ...validRoomInput, roomNumber: 'PH-1' });

  await assert.rejects(
    () => repo.createRoom({ ...validRoomInput, roomNumber: ' ph-1 ' }),
    (error: unknown) =>
      error instanceof RoomRepositoryError && error.code === 'DUPLICATE_ROOM_NUMBER'
  );

  await repo.createRoom({ ...validRoomInput, roomNumber: '900' });
  await assert.rejects(
    () => repo.createRoom({ ...validRoomInput, roomNumber: ' 900 ' }),
    (error: unknown) =>
      error instanceof RoomRepositoryError && error.code === 'DUPLICATE_ROOM_NUMBER'
  );
});

test('unknown categories are rejected', async () => {
  const repo = newRepository();
  await assert.rejects(
    () => repo.createRoom({ ...validRoomInput, categoryId: 'cat-does-not-exist' }),
    (error: unknown) =>
      error instanceof RoomRepositoryError && error.code === 'CATEGORY_NOT_FOUND'
  );
});

test('negative pricing is rejected by the repository', async () => {
  const repo = newRepository();
  await assert.rejects(
    () =>
      repo.createRoom({
        ...validRoomInput,
        pricing: { hourlyRate: -100, dailyRate: null, overnightRate: null, currency: 'TZS' },
      }),
    (error: unknown) =>
      error instanceof RoomRepositoryError && error.code === 'INVALID_PRICING'
  );
});

test('status updates change only the room status (no booking side effects)', async () => {
  const repo = newRepository();
  const [firstRoom] = await repo.listRooms();
  const before = await repo.listRooms();

  const updated = await repo.updateRoomStatus(firstRoom.id, 'MAINTENANCE');
  assert.equal(updated.status, 'MAINTENANCE');

  const after = await repo.listRooms();
  assert.equal(after.length, before.length);
  assert.equal(after.filter((room) => room.id === firstRoom.id)[0].status, 'MAINTENANCE');
  // Nothing resembling a booking/invoice collection exists in the data source.
  assert.ok(!('bookings' in (after as unknown as Record<string, unknown>)));
});

test('deleting a room removes it from storage', async () => {
  const repo = newRepository();
  const [room] = await repo.listRooms();
  await repo.deleteRoom(room.id);

  const rooms = await repo.listRooms();
  assert.equal(rooms.length, 11);
  assert.ok(!rooms.some((existing) => existing.id === room.id));
});

test('categories prevent duplicate names case-insensitively and can be renamed', async () => {
  const repo = newRepository();
  const categories = await repo.listCategories();

  assert.ok(findDuplicateCategoryName('  standard ', categories));

  await assert.rejects(
    () => repo.createCategory({ name: 'STANDARD', description: null }),
    (error: unknown) =>
      error instanceof RoomRepositoryError && error.code === 'DUPLICATE_CATEGORY_NAME'
  );

  const created = await repo.createCategory({
    name: 'Family',
    description: 'Rooms suited to families.',
  });
  assert.equal(created.name, 'Family');

  const renamed = await repo.updateCategory(created.id, {
    name: 'Family Deluxe',
    description: created.description,
  });
  assert.equal(renamed.name, 'Family Deluxe');
  assert.equal(renamed.createdAt, created.createdAt);
});

test('corrupt storage payloads are reseeded instead of crashing', async () => {
  const storage = createMemoryStorage();
  storage.setItem('enkai-lodgeflow.room-inventory.v1', '{not valid json');
  const repo = new LocalRoomRepository({ storage, latencyMs: 0 });

  const rooms = await repo.listRooms();
  assert.equal(rooms.length, 12);
});
