import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  BedDouble,
  CheckCircle2,
  Clock,
  Database,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Tags,
  Upload,
  Users,
  Wrench,
} from 'lucide-react';
import { Room, RoomCategory, RoomCategoryInput, RoomInput, RoomStatus } from '../../types/room';
import { countRoomsByStatus, percentageOf } from '../../data/roomValidation';
import {
  createRoom,
  createRoomCategory,
  deleteRoom,
  refreshRoomInventory,
  updateRoom,
  updateRoomCategory,
  updateRoomStatus,
  useRoomInventory,
} from '../../data/roomInventoryStore';
import { Button } from '../ui/Button';
import { PageHeader, SectionHeader } from '../ui/DataPresentation';
import { Input, FormField, Select, SearchInput } from '../ui/FormControls';
import { ConfirmDialog, Modal } from '../ui/Modal';
import {
  EmptyState,
  ErrorState,
  SkeletonLoader,
  SuccessState,
} from '../ui/StatusComponents';
import { RoomCard } from './RoomCard';
import { RoomFormModal } from './RoomFormModal';
import { CategoryFormModal } from './CategoryFormModal';
import { getCategoryName, ROOM_STATUS_META, ROOM_STATUS_OPTIONS } from './roomDisplay';
import { RoomRepositoryError } from '../../data/roomRepository';
import { getAdminToken, setAdminToken } from '../../data/adminToken';
import {
  clearLocalRoomInventory,
  commitLocalRoomImport,
  previewLocalRoomImport,
  readLocalRoomInventory,
  type LocalRoomInventory,
  type RoomImportCommitResult,
  type RoomImportPreview,
} from '../../data/roomImportClient';

interface Notice {
  tone: 'success' | 'error';
  title: string;
  message?: string;
}

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All statuses' },
  ...ROOM_STATUS_OPTIONS,
];

interface RoomStatCardProps {
  label: string;
  value: number;
  total: number;
  accentClass: string;
  icon: React.ReactNode;
}

const RoomStatCard: React.FC<RoomStatCardProps> = ({
  label,
  value,
  total,
  accentClass,
  icon,
}) => (
  <div className="bg-white border border-[#E1EAF5] rounded-2xl p-3.5 shadow-2xs">
    <div className="flex items-center justify-between gap-2">
      <span
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${accentClass}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="text-xl sm:text-2xl font-extrabold text-[#152B4A] font-mono tabular-nums">
        {value}
      </span>
    </div>
    <div className="text-xs font-semibold text-[#152B4A] mt-2 truncate">{label}</div>
    <div className="text-[11px] text-[#718096] mt-0.5">
      {percentageOf(total, value)}% of inventory
    </div>
  </div>
);

export const RoomManagementPage: React.FC = () => {
  const inventory = useRoomInventory();
  const { rooms, categories, status } = inventory;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RoomStatus>('ALL');
  const [notice, setNotice] = useState<Notice | null>(null);

  const [roomModal, setRoomModal] = useState<{
    mode: 'create' | 'edit';
    room: Room | null;
  } | null>(null);
  const [categoryModal, setCategoryModal] = useState<{
    mode: 'create' | 'edit';
    category: RoomCategory | null;
  } | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

  // GATE 2.0 — explicit one-time import of the Phase 1 browser inventory.
  const [localInventory, setLocalInventory] = useState<LocalRoomInventory | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<RoomImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importToken, setImportToken] = useState<string>(() => getAdminToken());
  const [importResult, setImportResult] = useState<RoomImportCommitResult | null>(null);
  const [clearLocalOpen, setClearLocalOpen] = useState(false);

  // Destructive operations are token-gated until D11 sessions exist.
  const [deleteAuth, setDeleteAuth] = useState<{
    room: Room;
    token: string;
    error: string | null;
    busy: boolean;
  } | null>(null);

  const counts = useMemo(() => countRoomsByStatus(rooms), [rooms]);

  useEffect(() => {
    setLocalInventory(readLocalRoomInventory());
  }, []);

  const filteredRooms = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rooms.filter((room) => {
      const matchesQuery =
        !query ||
        room.roomNumber.toLowerCase().includes(query) ||
        (room.name ?? '').toLowerCase().includes(query);
      const matchesCategory =
        categoryFilter === 'ALL' || room.categoryId === categoryFilter;
      const matchesStatus = statusFilter === 'ALL' || room.status === statusFilter;
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [rooms, search, categoryFilter, statusFilter]);

  const hasActiveFilters =
    search.trim().length > 0 || categoryFilter !== 'ALL' || statusFilter !== 'ALL';

  const categoryOptions = useMemo(
    () => [
      { value: 'ALL', label: 'All categories' },
      ...categories.map((category) => ({ value: category.id, label: category.name })),
    ],
    [categories]
  );

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('ALL');
    setStatusFilter('ALL');
  };

  const handleRoomSubmit = async (input: RoomInput) => {
    if (roomModal?.mode === 'edit' && roomModal.room) {
      const saved = await updateRoom(roomModal.room.id, input);
      setNotice({
        tone: 'success',
        title: `Room ${saved.roomNumber} updated`,
        message: 'Room details and pricing were saved to the lodge server.',
      });
      return;
    }
    const created = await createRoom(input);
    setNotice({
      tone: 'success',
      title: `Room ${created.roomNumber} created`,
      message: 'The room is now part of the lodge inventory.',
    });
  };

  const handleCategorySubmit = async (input: RoomCategoryInput) => {
    if (categoryModal?.mode === 'edit' && categoryModal.category) {
      const saved = await updateRoomCategory(categoryModal.category.id, input);
      setNotice({
        tone: 'success',
        title: `Category "${saved.name}" updated`,
        message: 'Rooms in this category now show the updated name.',
      });
      return;
    }
    const created = await createRoomCategory(input);
    setNotice({
      tone: 'success',
      title: `Category "${created.name}" added`,
      message: 'The new category is available when creating or editing rooms.',
    });
  };

  const handleStatusChange = async (room: Room, nextStatus: RoomStatus) => {
    if (room.status === nextStatus) return;
    setStatusSavingId(room.id);
    try {
      const updated = await updateRoomStatus(room.id, nextStatus);
      setNotice({
        tone: 'success',
        title: `Room ${updated.roomNumber} is now ${ROOM_STATUS_META[updated.status].label}`,
        message: 'Operational status updated. No booking, invoice or payment was created.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        title: 'Could not update room status',
        message: error instanceof Error ? error.message : 'Unexpected error.',
      });
    } finally {
      setStatusSavingId(null);
    }
  };

  type DeleteOutcome = { outcome: 'ok' | 'auth' | 'error'; message?: string };

  const performDelete = async (room: Room): Promise<DeleteOutcome> => {
    try {
      await deleteRoom(room.id);
      setNotice({
        tone: 'success',
        title: `Room ${room.roomNumber} deleted`,
        message: 'The room was removed from the server-side lodge inventory.',
      });
      return { outcome: 'ok' };
    } catch (error) {
      if (
        error instanceof RoomRepositoryError &&
        (error.code === 'FORBIDDEN' || error.code === 'ADMIN_TOKEN_NOT_CONFIGURED')
      ) {
        return { outcome: 'auth', message: error.message };
      }
      setNotice({
        tone: 'error',
        title: 'Could not delete room',
        message: error instanceof Error ? error.message : 'Unexpected error.',
      });
      return {
        outcome: 'error',
        message: error instanceof Error ? error.message : 'Unexpected error.',
      };
    }
  };

  const handleDeleteRoom = async () => {
    if (!roomToDelete) return;
    const room = roomToDelete;
    setDeleting(true);
    try {
      const result = await performDelete(room);
      if (result.outcome === 'ok') {
        setRoomToDelete(null);
      } else if (result.outcome === 'auth') {
        setRoomToDelete(null);
        setDeleteAuth({ room, token: getAdminToken(), error: result.message ?? null, busy: false });
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteWithToken = async () => {
    if (!deleteAuth) return;
    setAdminToken(deleteAuth.token);
    setDeleteAuth({ ...deleteAuth, busy: true, error: null });
    const result = await performDelete(deleteAuth.room);
    if (result.outcome === 'ok') {
      setDeleteAuth(null);
      return;
    }
    setDeleteAuth((current) =>
      current
        ? {
            ...current,
            busy: false,
            error:
              result.outcome === 'auth'
                ? result.message ?? 'The admin token was rejected.'
                : result.message ?? 'The room could not be deleted.',
          }
        : null
    );
  };

  const handleOpenImport = async () => {
    if (!localInventory) return;
    setImportOpen(true);
    setImportResult(null);
    setImportError(null);
    setImportPreview(null);
    setImportBusy(true);
    try {
      setImportPreview(await previewLocalRoomImport(localInventory));
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : 'The import preview could not be generated.'
      );
    } finally {
      setImportBusy(false);
    }
  };

  const handleImportCommit = async () => {
    if (!localInventory) return;
    setImportBusy(true);
    setImportError(null);
    setAdminToken(importToken);
    try {
      const result = await commitLocalRoomImport(localInventory);
      setImportResult(result);
      await refreshRoomInventory();
      setLocalInventory(readLocalRoomInventory());
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : 'The import could not be completed.'
      );
    } finally {
      setImportBusy(false);
    }
  };

  const handleClearLocalInventory = () => {
    clearLocalRoomInventory();
    setLocalInventory(null);
    setClearLocalOpen(false);
    setImportOpen(false);
    setNotice({
      tone: 'success',
      title: 'Browser copy cleared',
      message: 'The server database is now the only room inventory.',
    });
  };

  const header = (
    <PageHeader
      title="Room Management"
      subtitle="Lodge room inventory, operational status, categories and configurable TZS rates."
      icon={<BedDouble className="w-5 h-5" />}
      actions={
        <>
          <Button
            variant="outline"
            size="md"
            icon={<Tags className="w-4 h-4" />}
            onClick={() => setCategoryModal({ mode: 'create', category: null })}
          >
            Add Category
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setRoomModal({ mode: 'create', room: null })}
          >
            Add Room
          </Button>
        </>
      }
    />
  );

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        {header}
        <div className="space-y-3">
          <SkeletonLoader rows={2} variant="kpi" />
          <SkeletonLoader rows={5} variant="card" />
        </div>
        <p className="sr-only" role="status">
          Loading room inventory…
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          code="ROOM_DATA_UNAVAILABLE"
          message={inventory.error || 'Room inventory could not be loaded.'}
          detail="Room records are loaded from the lodge server. Confirm the server and PostgreSQL connection are available, then retry."
          onRetry={() => {
            setNotice(null);
            void refreshRoomInventory();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {notice && (
        <div role="status" aria-live="polite">
          {notice.tone === 'success' ? (
            <SuccessState
              title={notice.title}
              message={notice.message}
              onDismiss={() => setNotice(null)}
            />
          ) : (
            <ErrorState
              message={notice.title}
              detail={notice.message}
              onDismiss={() => setNotice(null)}
            />
          )}
        </div>
      )}

      {/* Persistence transparency */}
      <div className="rounded-xl border border-[#12B981]/30 bg-[#ECFDF5] px-4 py-3 flex items-start gap-3">
        <Database className="w-4 h-4 text-[#0D9468] shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="text-xs font-bold text-[#0D9468]">Server-backed inventory</div>
          <p className="text-[11px] text-[#0B6B4F] leading-relaxed">
            Rooms, categories and pricing are stored in the lodge database and shared
            through the room API, so every workstation sees the same records.
          </p>
        </div>
      </div>

      {localInventory && (
        <div className="rounded-xl border border-[#F5A623]/35 bg-[#FFFBEB] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Upload className="w-4 h-4 text-[#B87503] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-[#B87503]">
                Local Phase 1 inventory detected
              </div>
              <p className="text-[11px] text-[#8A5A00] leading-relaxed">
                {localInventory.rooms.length} rooms and {localInventory.categories.length}{' '}
                categories are still stored in this browser. Review them and import them into
                the server database once.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={<Upload className="w-3.5 h-3.5" />}
            onClick={() => {
              void handleOpenImport();
            }}
          >
            Review &amp; import
          </Button>
        </div>
      )}

      {/* Rooms dashboard */}
      <section className="space-y-3" aria-label="Room inventory summary">
        <SectionHeader
          title="Rooms Dashboard"
          subtitle="Figures calculated live from the room records below."
          icon={<BedDouble className="w-4 h-4" />}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <RoomStatCard
            label="Total Rooms"
            value={counts.total}
            total={counts.total}
            accentClass="bg-[#EAF3FF] text-[#1769E8]"
            icon={<BedDouble className="w-4 h-4" />}
          />
          <RoomStatCard
            label="Available"
            value={counts.available}
            total={counts.total}
            accentClass={ROOM_STATUS_META.AVAILABLE.accentClass}
            icon={<CheckCircle2 className="w-4 h-4" />}
          />
          <RoomStatCard
            label="Occupied"
            value={counts.occupied}
            total={counts.total}
            accentClass={ROOM_STATUS_META.OCCUPIED.accentClass}
            icon={<Users className="w-4 h-4" />}
          />
          <RoomStatCard
            label="Reserved"
            value={counts.reserved}
            total={counts.total}
            accentClass={ROOM_STATUS_META.RESERVED.accentClass}
            icon={<Clock className="w-4 h-4" />}
          />
          <RoomStatCard
            label="Cleaning"
            value={counts.cleaning}
            total={counts.total}
            accentClass={ROOM_STATUS_META.CLEANING.accentClass}
            icon={<Sparkles className="w-4 h-4" />}
          />
          <RoomStatCard
            label="Maintenance"
            value={counts.maintenance}
            total={counts.total}
            accentClass={ROOM_STATUS_META.MAINTENANCE.accentClass}
            icon={<Wrench className="w-4 h-4" />}
          />
          <RoomStatCard
            label="Out of Service"
            value={counts.outOfService}
            total={counts.total}
            accentClass={ROOM_STATUS_META.OUT_OF_SERVICE.accentClass}
            icon={<Ban className="w-4 h-4" />}
          />
        </div>
      </section>

      {/* Room list */}
      <section className="bg-white border border-[#E1EAF5] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <SectionHeader
          title="Room List"
          subtitle="Status changes are operational only — they never create bookings, check-ins or payments."
          icon={<BedDouble className="w-4 h-4" />}
          rightContent={
            <span className="text-[11px] font-semibold text-[#718096] font-mono tabular-nums">
              {filteredRooms.length} of {rooms.length}
            </span>
          }
        />

        <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by room number or name…"
            className="lg:w-72"
          />
          <Select
            aria-label="Filter rooms by category"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            options={categoryOptions}
            className="lg:w-52"
          />
          <Select
            aria-label="Filter rooms by status"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'ALL' | RoomStatus)
            }
            options={STATUS_FILTER_OPTIONS}
            className="lg:w-52"
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={clearFilters}
            disabled={!hasActiveFilters}
          >
            Clear filters
          </Button>
        </div>

        {rooms.length === 0 ? (
          <EmptyState
            icon={<BedDouble className="w-6 h-6" />}
            title="No rooms in this inventory yet"
            description="Add your first room to start tracking availability, operational status and pricing."
            actionLabel="Add Room"
            onAction={() => setRoomModal({ mode: 'create', room: null })}
          />
        ) : filteredRooms.length === 0 ? (
          <EmptyState
            icon={<BedDouble className="w-6 h-6" />}
            title="No rooms match these filters"
            description="Try a different room number, name, category or status."
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                categoryName={getCategoryName(categories, room.categoryId)}
                statusSaving={statusSavingId === room.id}
                onEdit={() => setRoomModal({ mode: 'edit', room })}
                onDelete={() => setRoomToDelete(room)}
                onStatusChange={(nextStatus) => {
                  void handleStatusChange(room, nextStatus);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Categories */}
      <section className="bg-white border border-[#E1EAF5] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <SectionHeader
          title="Room Categories"
          subtitle="Every room belongs to a category. Add or rename categories at any time."
          icon={<Tags className="w-4 h-4" />}
          rightContent={
            <Button
              variant="outline"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setCategoryModal({ mode: 'create', category: null })}
            >
              Add Category
            </Button>
          }
        />

        {categories.length === 0 ? (
          <EmptyState
            compact
            icon={<Tags className="w-6 h-6" />}
            title="No room categories yet"
            description="Create a category such as Standard, Deluxe or Suite before adding rooms."
            actionLabel="Add Category"
            onAction={() => setCategoryModal({ mode: 'create', category: null })}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {categories.map((category) => {
              const roomsInCategory = rooms.filter(
                (room) => room.categoryId === category.id
              ).length;
              return (
                <div
                  key={category.id}
                  className="border border-[#E1EAF5] rounded-xl p-3.5 bg-[#F5F8FD]/50 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[#082B59]">
                        {category.name}
                      </div>
                      <div className="text-[11px] text-[#718096] font-mono tabular-nums mt-0.5">
                        {roomsInCategory} {roomsInCategory === 1 ? 'room' : 'rooms'}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Pencil className="w-3.5 h-3.5" />}
                      onClick={() => setCategoryModal({ mode: 'edit', category })}
                      title={`Edit category ${category.name}`}
                      className="!px-2"
                    />
                  </div>
                  <p className="text-[11px] text-[#718096] leading-relaxed line-clamp-3">
                    {category.description || 'No description provided.'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <RoomFormModal
        isOpen={roomModal !== null}
        mode={roomModal?.mode ?? 'create'}
        room={roomModal?.room ?? null}
        categories={categories}
        rooms={rooms}
        onClose={() => setRoomModal(null)}
        onSubmit={handleRoomSubmit}
      />

      <CategoryFormModal
        isOpen={categoryModal !== null}
        mode={categoryModal?.mode ?? 'create'}
        category={categoryModal?.category ?? null}
        categories={categories}
        roomCount={
          categoryModal?.category
            ? rooms.filter((room) => room.categoryId === categoryModal.category?.id)
                .length
            : 0
        }
        onClose={() => setCategoryModal(null)}
        onSubmit={handleCategorySubmit}
      />

      <ConfirmDialog
        isOpen={roomToDelete !== null}
        onClose={() => {
          if (!deleting) setRoomToDelete(null);
        }}
        onConfirm={() => {
          void handleDeleteRoom();
        }}
        title={
          roomToDelete
            ? `Delete room ${roomToDelete.roomNumber}?`
            : 'Delete room?'
        }
        description={
          roomToDelete
            ? `Room ${roomToDelete.roomNumber}${
                roomToDelete.name ? ` (${roomToDelete.name})` : ''
              } will be removed from the lodge inventory. This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete Room"
        variant="danger"
        loading={deleting}
      />

      <Modal
        isOpen={deleteAuth !== null}
        onClose={() => {
          if (!deleteAuth?.busy) setDeleteAuth(null);
        }}
        title={deleteAuth ? `Delete room ${deleteAuth.room.roomNumber}?` : 'Delete room?'}
        description="Room deletion is a destructive server operation and requires the lodge admin token."
        size="sm"
        confirmLabel="Delete Room"
        confirmVariant="danger"
        onConfirm={() => {
          void handleDeleteWithToken();
        }}
        loading={deleteAuth?.busy ?? false}
      >
        <div className="space-y-3">
          {deleteAuth?.error && (
            <div
              role="alert"
              className="rounded-lg border border-[#EF4444]/30 bg-[#FEF2F2] px-3 py-2 text-[11px] text-[#B91C1C]"
            >
              {deleteAuth.error}
            </div>
          )}
          <FormField
            label="Admin token"
            hint="Kept for this browser session only. Configured on the server as ROOM_ADMIN_TOKEN."
          >
            <Input
              type="password"
              value={deleteAuth?.token ?? ''}
              onChange={(event) =>
                setDeleteAuth((current) =>
                  current ? { ...current, token: event.target.value } : current
                )
              }
              placeholder="Enter the admin token"
              autoComplete="off"
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        isOpen={importOpen}
        onClose={() => {
          if (importBusy) return;
          setImportOpen(false);
          setImportPreview(null);
          setImportResult(null);
          setImportError(null);
        }}
        title="Import local room inventory"
        description="Phase 1 browser data is validated and reviewed here before anything is written to PostgreSQL."
        size="lg"
        confirmLabel={importResult ? 'Close' : 'Import now'}
        onConfirm={() => {
          if (importResult) {
            setImportOpen(false);
            return;
          }
          void handleImportCommit();
        }}
        loading={importBusy}
        confirmDisabled={
          importBusy ||
          (!importResult &&
            (!importPreview ||
              importPreview.rooms.importable + importPreview.categories.importable === 0))
        }
      >
        <div className="space-y-4">
          {importError && (
            <div
              role="alert"
              className="rounded-lg border border-[#EF4444]/30 bg-[#FEF2F2] px-3 py-2 text-[11px] text-[#B91C1C]"
            >
              {importError}
            </div>
          )}

          {importBusy && !importPreview && !importResult && (
            <p className="text-xs text-[#718096]">Validating the browser inventory…</p>
          )}

          {importResult ? (
            <div className="space-y-3 text-xs text-[#152B4A]">
              <div className="rounded-lg border border-[#12B981]/30 bg-[#ECFDF5] px-3 py-2">
                <div className="font-bold text-[#0D9468]">Import completed</div>
                <div className="mt-1 leading-relaxed">
                  Imported {importResult.importedCategories} categories and{' '}
                  {importResult.importedRooms} rooms. Skipped {importResult.skippedCategories}{' '}
                  categories and {importResult.skippedRooms} rooms.
                </div>
              </div>
              {importResult.issues.length > 0 && (
                <p className="text-[11px] text-[#718096]">
                  {importResult.issues.length} record(s) were skipped or need attention. The
                  server records were never overwritten.
                </p>
              )}
              <Button variant="outline" size="sm" onClick={() => setClearLocalOpen(true)}>
                Clear browser copy
              </Button>
            </div>
          ) : importPreview ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['categories', 'rooms'] as const).map((key) => {
                  const summary = importPreview[key];
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-[#E1EAF5] bg-[#F5F8FD]/60 p-3"
                    >
                      <div className="text-xs font-bold text-[#082B59] capitalize">{key}</div>
                      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[#718096]">
                        <dt>Total</dt>
                        <dd className="text-right font-mono text-[#152B4A]">{summary.total}</dd>
                        <dt>Importable</dt>
                        <dd className="text-right font-mono text-[#0D9468]">
                          {summary.importable}
                        </dd>
                        <dt>Unchanged</dt>
                        <dd className="text-right font-mono text-[#152B4A]">
                          {summary.unchanged}
                        </dd>
                        <dt>Conflicts</dt>
                        <dd className="text-right font-mono text-[#B87503]">
                          {summary.conflicts}
                        </dd>
                        <dt>Invalid</dt>
                        <dd className="text-right font-mono text-[#DC2626]">
                          {summary.invalid}
                        </dd>
                      </dl>
                    </div>
                  );
                })}
              </div>

              {importPreview.issues.length > 0 && (
                <div className="rounded-lg border border-[#E1EAF5] bg-white p-3">
                  <div className="text-xs font-bold text-[#082B59]">
                    Records that will be skipped or need attention ({importPreview.issues.length})
                  </div>
                  <ul className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {importPreview.issues.slice(0, 20).map((issue, index) => (
                      <li
                        key={`${issue.recordType}-${issue.index}-${issue.code}-${index}`}
                        className="text-[11px] text-[#718096] leading-relaxed"
                      >
                        <span className="font-mono text-[#152B4A]">{issue.recordType}</span>{' '}
                        {issue.id ? `(${issue.id})` : `#${issue.index + 1}`}: {issue.message}
                      </li>
                    ))}
                  </ul>
                  {importPreview.issues.length > 20 && (
                    <p className="mt-1 text-[11px] text-[#718096]">
                      …and {importPreview.issues.length - 20} more.
                    </p>
                  )}
                </div>
              )}

              <FormField
                label="Server admin token"
                hint="Matches ROOM_ADMIN_TOKEN on the server. Kept for this browser session only."
              >
                <Input
                  type="password"
                  value={importToken}
                  onChange={(event) => setImportToken(event.target.value)}
                  placeholder="Enter the admin token"
                  autoComplete="off"
                />
              </FormField>
            </>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={clearLocalOpen}
        onClose={() => setClearLocalOpen(false)}
        onConfirm={handleClearLocalInventory}
        title="Clear the browser copy?"
        description="The import has already been written to the server. Removing the browser copy prevents stale local data from being imported again. Server records are not affected."
        confirmLabel="Clear browser copy"
        variant="danger"
      />
    </div>
  );
};
