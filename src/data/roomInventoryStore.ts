/**
 * ENKAI LODGEFLOW — PHASE 1
 * Small external store that keeps every room consumer (Rooms page, Dashboard)
 * on the same data. Subscribes React via `useSyncExternalStore`.
 */

import { useEffect, useSyncExternalStore } from 'react';
import {
  Room,
  RoomCategory,
  RoomCategoryInput,
  RoomInput,
  RoomStatus,
  RoomUpdateInput,
} from '../types/room';
import {
  HttpRoomRepository,
} from './httpRoomRepository';
import { RoomRepositoryError } from './roomRepository';

export interface RoomInventoryState {
  status: 'loading' | 'ready' | 'error';
  rooms: Room[];
  categories: RoomCategory[];
  error: string | null;
  /** GATE 2.0: PostgreSQL via the server API is the only writable source. */
  persistence: 'server';
}

const repository = new HttpRoomRepository();

let state: RoomInventoryState = {
  status: 'loading',
  rooms: [],
  categories: [],
  error: null,
  persistence: 'server',
};

const listeners = new Set<() => void>();
let loadPromise: Promise<void> | null = null;

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(next: RoomInventoryState): void {
  state = next;
  emit();
}

function errorMessage(error: unknown): string {
  if (error instanceof RoomRepositoryError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unexpected room data error.';
}

export function subscribeRoomInventory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRoomInventoryState(): RoomInventoryState {
  return state;
}

export function ensureRoomInventoryLoaded(): Promise<void> {
  if (state.status === 'ready') return Promise.resolve();
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const [rooms, categories] = await Promise.all([
          repository.listRooms(),
          repository.listCategories(),
        ]);
        setState({ ...state, status: 'ready', rooms, categories, error: null });
      } catch (error) {
        setState({ ...state, status: 'error', error: errorMessage(error) });
        loadPromise = null;
      }
    })();
  }
  return loadPromise;
}

export function refreshRoomInventory(): Promise<void> {
  loadPromise = null;
  setState({ ...state, status: 'loading', error: null });
  return ensureRoomInventoryLoaded();
}

export async function createRoom(input: RoomInput): Promise<Room> {
  const room = await repository.createRoom(input);
  setState({ ...state, status: 'ready', rooms: [...state.rooms, room] });
  return room;
}

export async function updateRoom(id: string, input: RoomUpdateInput): Promise<Room> {
  const room = await repository.updateRoom(id, input);
  setState({
    ...state,
    rooms: state.rooms.map((existing) => (existing.id === id ? room : existing)),
  });
  return room;
}

/** Operational status change only — never creates bookings or transactions. */
export async function updateRoomStatus(id: string, status: RoomStatus): Promise<Room> {
  const room = await repository.updateRoomStatus(id, status);
  setState({
    ...state,
    rooms: state.rooms.map((existing) => (existing.id === id ? room : existing)),
  });
  return room;
}

export async function deleteRoom(id: string): Promise<void> {
  await repository.deleteRoom(id);
  setState({ ...state, rooms: state.rooms.filter((room) => room.id !== id) });
}

export async function createRoomCategory(input: RoomCategoryInput) {
  const category = await repository.createCategory(input);
  setState({ ...state, categories: [...state.categories, category] });
  return category;
}

export async function updateRoomCategory(id: string, input: RoomCategoryInput) {
  const category = await repository.updateCategory(id, input);
  setState({
    ...state,
    categories: state.categories.map((existing) =>
      existing.id === id ? category : existing
    ),
  });
  return category;
}

export async function deleteRoomCategory(id: string): Promise<void> {
  await repository.deleteCategory(id);
  setState({
    ...state,
    categories: state.categories.filter((category) => category.id !== id),
  });
}

export function useRoomInventory(): RoomInventoryState {
  const snapshot = useSyncExternalStore(
    subscribeRoomInventory,
    getRoomInventoryState,
    getRoomInventoryState
  );

  useEffect(() => {
    void ensureRoomInventoryLoaded();
  }, []);

  return snapshot;
}

export { repository as roomRepository, RoomRepositoryError };
