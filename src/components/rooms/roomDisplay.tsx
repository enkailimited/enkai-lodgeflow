import React from 'react';
import { RoomCategory, RoomStatus, ROOM_STATUSES } from '../../types/room';
import { formatTzs } from '../../data/roomValidation';

export interface RoomStatusMeta {
  label: string;
  badgeClass: string;
  dotClass: string;
  accentClass: string;
  description: string;
}

/**
 * User-friendly labels + visual treatment for the exact Phase 1 status codes.
 * Colours are chosen to stay inside the existing ENKAI blue/white palette while
 * remaining distinguishable for colour-blind users (label + dot + colour).
 */
export const ROOM_STATUS_META: Record<RoomStatus, RoomStatusMeta> = {
  AVAILABLE: {
    label: 'Available',
    badgeClass: 'bg-[#12B981]/12 text-[#0D9468] border-[#12B981]/25',
    dotClass: 'bg-[#12B981]',
    accentClass: 'bg-[#12B981]/12 text-[#0D9468]',
    description: 'Ready for sale and immediate occupancy.',
  },
  OCCUPIED: {
    label: 'Occupied',
    badgeClass: 'bg-[#EAF3FF] text-[#1769E8] border-[#1769E8]/20',
    dotClass: 'bg-[#1769E8]',
    accentClass: 'bg-[#EAF3FF] text-[#1769E8]',
    description: 'Currently in use by a guest.',
  },
  RESERVED: {
    label: 'Reserved',
    badgeClass: 'bg-[#F5A623]/12 text-[#B87503] border-[#F5A623]/30',
    dotClass: 'bg-[#F5A623]',
    accentClass: 'bg-[#F5A623]/12 text-[#B87503]',
    description: 'Held for a future arrival.',
  },
  CLEANING: {
    label: 'Cleaning',
    badgeClass: 'bg-[#8B5CF6]/12 text-[#6D28D9] border-[#8B5CF6]/25',
    dotClass: 'bg-[#8B5CF6]',
    accentClass: 'bg-[#8B5CF6]/12 text-[#6D28D9]',
    description: 'Housekeeping is preparing the room.',
  },
  MAINTENANCE: {
    label: 'Maintenance',
    badgeClass: 'bg-[#F97316]/12 text-[#C2410C] border-[#F97316]/25',
    dotClass: 'bg-[#F97316]',
    accentClass: 'bg-[#F97316]/12 text-[#C2410C]',
    description: 'Temporarily withdrawn for repairs.',
  },
  OUT_OF_SERVICE: {
    label: 'Out of Service',
    badgeClass: 'bg-[#EF4444]/12 text-[#DC2626] border-[#EF4444]/25',
    dotClass: 'bg-[#EF4444]',
    accentClass: 'bg-[#EF4444]/12 text-[#DC2626]',
    description: 'Not sellable until further notice.',
  },
};

export const RoomStatusBadge: React.FC<{ status: RoomStatus; className?: string }> = ({
  status,
  className = '',
}) => {
  const meta = ROOM_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full border whitespace-nowrap shrink-0 ${meta.badgeClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
      <span>{meta.label}</span>
    </span>
  );
};

export const ROOM_STATUS_OPTIONS = ROOM_STATUSES.map((status) => ({
  value: status,
  label: ROOM_STATUS_META[status].label,
}));

export function getCategoryName(categories: RoomCategory[], categoryId: string): string {
  const match = categories.find((category) => category.id === categoryId);
  return match ? match.name : 'Uncategorised';
}

export interface PricingPeriodMeta {
  key: 'hourlyRate' | 'dailyRate' | 'overnightRate';
  label: string;
  shortLabel: string;
}

export const PRICING_PERIODS: PricingPeriodMeta[] = [
  { key: 'hourlyRate', label: 'Hourly rate', shortLabel: 'Hourly' },
  { key: 'dailyRate', label: 'Daily rate', shortLabel: 'Daily' },
  { key: 'overnightRate', label: 'Overnight rate', shortLabel: 'Overnight' },
];

export const PricingChip: React.FC<{ label: string; amount: number | null }> = ({
  label,
  amount,
}) => {
  const configured = amount !== null;
  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 ${
        configured
          ? 'bg-[#F5F8FD] border-[#E1EAF5]'
          : 'bg-white border-dashed border-[#CBD5E1]'
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#718096]">
        {label}
      </div>
      <div
        className={`text-xs font-mono font-bold tabular-nums mt-0.5 ${
          configured ? 'text-[#082B59]' : 'text-[#94A3B8] italic font-sans font-medium'
        }`}
      >
        {formatTzs(amount)}
      </div>
    </div>
  );
};
