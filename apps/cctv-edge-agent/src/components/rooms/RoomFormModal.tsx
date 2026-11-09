import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Banknote } from 'lucide-react';
import { Room, RoomCategory, RoomInput, RoomStatus } from '../../types/room';
import {
  findDuplicateRoomNumber,
  isBlank,
  parseCapacity,
  parseOptionalPrice,
} from '../../data/roomValidation';
import { RoomRepositoryError } from '../../data/roomRepository';
import { Button } from '../ui/Button';
import { FormField, Input, Select, Textarea } from '../ui/FormControls';
import { Modal } from '../ui/Modal';
import { PRICING_PERIODS, ROOM_STATUS_OPTIONS } from './roomDisplay';

export interface RoomFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  room: Room | null;
  categories: RoomCategory[];
  rooms: Room[];
  onClose: () => void;
  onSubmit: (input: RoomInput) => Promise<void>;
}

interface FormState {
  roomNumber: string;
  name: string;
  categoryId: string;
  floor: string;
  capacity: string;
  status: RoomStatus;
  description: string;
  hourlyRate: string;
  dailyRate: string;
  overnightRate: string;
}

type FormErrors = Partial<Record<keyof FormState | 'form', string>>;

const EMPTY_FORM: FormState = {
  roomNumber: '',
  name: '',
  categoryId: '',
  floor: '',
  capacity: '2',
  status: 'AVAILABLE',
  description: '',
  hourlyRate: '',
  dailyRate: '',
  overnightRate: '',
};

function toFormState(room: Room | null): FormState {
  if (!room) return { ...EMPTY_FORM };
  return {
    roomNumber: room.roomNumber,
    name: room.name ?? '',
    categoryId: room.categoryId,
    floor: room.floor,
    capacity: String(room.capacity),
    status: room.status,
    description: room.description ?? '',
    hourlyRate: room.pricing.hourlyRate === null ? '' : String(room.pricing.hourlyRate),
    dailyRate: room.pricing.dailyRate === null ? '' : String(room.pricing.dailyRate),
    overnightRate:
      room.pricing.overnightRate === null ? '' : String(room.pricing.overnightRate),
  };
}

export const RoomFormModal: React.FC<RoomFormModalProps> = ({
  isOpen,
  mode,
  room,
  categories,
  rooms,
  onClose,
  onSubmit,
}) => {
  const [form, setForm] = useState<FormState>(() => toFormState(room));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(toFormState(room));
      setErrors({});
      setSaving(false);
    }
  }, [isOpen, room]);

  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'Select a category…' },
      ...categories.map((category) => ({ value: category.id, label: category.name })),
    ],
    [categories]
  );

  const update = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validate = (): { input: RoomInput | null; errors: FormErrors } => {
    const nextErrors: FormErrors = {};

    if (isBlank(form.roomNumber)) {
      nextErrors.roomNumber = 'Room number is required.';
    } else if (findDuplicateRoomNumber(form.roomNumber, rooms, room?.id)) {
      nextErrors.roomNumber = `Room number "${form.roomNumber.trim()}" is already in use.`;
    }

    if (!form.categoryId) {
      nextErrors.categoryId = 'Select a room category.';
    }

    if (isBlank(form.floor)) {
      nextErrors.floor = 'Floor / location is required.';
    }

    const capacity = parseCapacity(form.capacity);
    if (capacity.error) nextErrors.capacity = capacity.error;

    const hourly = parseOptionalPrice(form.hourlyRate);
    if (hourly.error) nextErrors.hourlyRate = hourly.error;

    const daily = parseOptionalPrice(form.dailyRate);
    if (daily.error) nextErrors.dailyRate = daily.error;

    const overnight = parseOptionalPrice(form.overnightRate);
    if (overnight.error) nextErrors.overnightRate = overnight.error;

    if (
      !nextErrors.roomNumber &&
      !nextErrors.categoryId &&
      !nextErrors.floor &&
      !nextErrors.capacity &&
      !nextErrors.hourlyRate &&
      !nextErrors.dailyRate &&
      !nextErrors.overnightRate &&
      capacity.value !== null
    ) {
      return {
        input: {
          roomNumber: form.roomNumber,
          name: form.name,
          categoryId: form.categoryId,
          floor: form.floor,
          capacity: capacity.value,
          status: form.status,
          description: form.description,
          pricing: {
            hourlyRate: hourly.value,
            dailyRate: daily.value,
            overnightRate: overnight.value,
            currency: 'TZS',
          },
        },
        errors: {},
      };
    }

    return { input: null, errors: nextErrors };
  };

  const handleSubmit = async () => {
    const { input, errors: validationErrors } = validate();
    if (!input) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      await onSubmit(input);
      onClose();
    } catch (error) {
      if (error instanceof RoomRepositoryError) {
        const field = (error.field as keyof FormState | undefined) ?? 'form';
        setErrors({ [field]: error.message });
      } else {
        setErrors({
          form: error instanceof Error ? error.message : 'Could not save this room.',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={mode === 'create' ? 'Add Room' : `Edit Room ${room?.roomNumber ?? ''}`}
      description="Room inventory, operational status and configurable TZS rates."
      size="lg"
      footer={
        <>
          <Button variant="outline" size="md" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            loading={saving}
            loadingText="Saving…"
          >
            {mode === 'create' ? 'Create Room' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        {errors.form && (
          <div
            role="alert"
            className="flex items-start gap-2 p-3 rounded-xl bg-[#FEF2F2] border border-[#EF4444]/30 text-[#152B4A]"
          >
            <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
            <p className="text-xs font-semibold">{errors.form}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Room number" htmlFor="room-number" required error={errors.roomNumber}>
            <Input
              id="room-number"
              value={form.roomNumber}
              onChange={(event) => update('roomNumber', event.target.value)}
              placeholder="e.g. 101"
              mono
              autoFocus
              error={errors.roomNumber}
              maxLength={16}
            />
          </FormField>

          <FormField label="Room name" htmlFor="room-name" hint="Optional descriptive name.">
            <Input
              id="room-name"
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="e.g. Garden View King"
              maxLength={80}
            />
          </FormField>

          <FormField label="Category" htmlFor="room-category" required error={errors.categoryId}>
            <Select
              id="room-category"
              value={form.categoryId}
              onChange={(event) => update('categoryId', event.target.value)}
              options={categoryOptions}
              error={errors.categoryId}
            />
          </FormField>

          <FormField label="Floor / location" htmlFor="room-floor" required error={errors.floor}>
            <Input
              id="room-floor"
              value={form.floor}
              onChange={(event) => update('floor', event.target.value)}
              placeholder="e.g. Floor 1 — North Wing"
              error={errors.floor}
              maxLength={60}
            />
          </FormField>

          <FormField
            label="Maximum occupancy"
            htmlFor="room-capacity"
            required
            error={errors.capacity}
            hint="Number of guests the room can hold."
          >
            <Input
              id="room-capacity"
              type="number"
              min={1}
              max={20}
              step={1}
              value={form.capacity}
              onChange={(event) => update('capacity', event.target.value)}
              error={errors.capacity}
              mono
            />
          </FormField>

          <FormField
            label="Operational status"
            htmlFor="room-status"
            hint="Status changes never create bookings or payments."
          >
            <Select
              id="room-status"
              value={form.status}
              onChange={(event) => update('status', event.target.value as RoomStatus)}
              options={ROOM_STATUS_OPTIONS}
            />
          </FormField>
        </div>

        <FormField label="Description" htmlFor="room-description" hint="Optional notes shown on the room card.">
          <Textarea
            id="room-description"
            rows={2}
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            placeholder="Short description of the room."
            maxLength={240}
          />
        </FormField>

        <fieldset className="rounded-xl border border-[#E1EAF5] bg-[#F5F8FD]/50 p-4 space-y-3">
          <legend className="px-1.5 flex items-center gap-1.5 text-xs font-bold text-[#082B59]">
            <Banknote className="w-4 h-4 text-[#1769E8]" />
            Room pricing (TZS)
          </legend>
          <p className="text-[11px] text-[#718096]">
            Leave a rate blank if it is not offered. Configuration only — no invoices or
            payments are created in this phase.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PRICING_PERIODS.map((period) => (
              <FormField
                key={period.key}
                label={period.label}
                htmlFor={`price-${period.key}`}
                error={errors[period.key]}
                hint={errors[period.key] ? undefined : 'Blank = not configured'}
              >
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#718096]">
                    TZS
                  </span>
                  <Input
                    id={`price-${period.key}`}
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={form[period.key]}
                    onChange={(event) => update(period.key, event.target.value)}
                    placeholder="Not configured"
                    className="!pl-12"
                    error={errors[period.key]}
                    mono
                  />
                </div>
              </FormField>
            ))}
          </div>
        </fieldset>

        <p className="text-[11px] text-[#718096]">
          Room records are saved to the lodge database through the room API and are shared
          across workstations.
        </p>

        {/* Enables Enter-to-submit without rendering a duplicate visible button. */}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
};
