import React from 'react';
import { BedDouble, MapPin, Pencil, Trash2, Users } from 'lucide-react';
import { Room, RoomStatus } from '../../types/room';
import { Button } from '../ui/Button';
import { Select } from '../ui/FormControls';
import {
  PricingChip,
  PRICING_PERIODS,
  ROOM_STATUS_META,
  ROOM_STATUS_OPTIONS,
  RoomStatusBadge,
} from './roomDisplay';

export interface RoomCardProps {
  room: Room;
  categoryName: string;
  statusSaving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: RoomStatus) => void;
}

export const RoomCard: React.FC<RoomCardProps> = ({
  room,
  categoryName,
  statusSaving,
  onEdit,
  onDelete,
  onStatusChange,
}) => {
  const meta = ROOM_STATUS_META[room.status];

  return (
    <article
      className="bg-white border border-[#E1EAF5] rounded-2xl shadow-2xs flex flex-col overflow-hidden hover:border-[#1769E8]/40 hover:shadow-sm transition-all"
      aria-label={`Room ${room.roomNumber}${room.name ? ` — ${room.name}` : ''}`}
    >
      <div className="p-4 space-y-3 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${meta.accentClass}`}
              aria-hidden="true"
            >
              <BedDouble className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-base font-extrabold text-[#082B59] font-mono tabular-nums">
                  {room.roomNumber}
                </span>
                <span className="text-[11px] font-semibold text-[#718096] uppercase tracking-wider">
                  {categoryName}
                </span>
              </div>
              <h3 className="text-xs sm:text-sm font-semibold text-[#152B4A] truncate">
                {room.name || 'Unnamed room'}
              </h3>
            </div>
          </div>
          <RoomStatusBadge status={room.status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#718096]">
          <span className="inline-flex items-center gap-1 min-w-0">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{room.floor}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="w-3.5 h-3.5 shrink-0" />
            {room.capacity} {room.capacity === 1 ? 'guest' : 'guests'} max
          </span>
        </div>

        {room.description && (
          <p className="text-xs text-[#718096] leading-relaxed line-clamp-2">
            {room.description}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 pt-0.5">
          {PRICING_PERIODS.map((period) => (
            <PricingChip
              key={period.key}
              label={period.shortLabel}
              amount={room.pricing[period.key]}
            />
          ))}
        </div>

        {room.pricing.hourlyRate === null &&
          room.pricing.dailyRate === null &&
          room.pricing.overnightRate === null && (
            <p className="text-[11px] text-[#B87503] font-medium">
              No room rates configured yet.
            </p>
          )}
      </div>

      <div className="border-t border-[#E1EAF5] bg-[#F5F8FD]/60 px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <label
            htmlFor={`room-status-${room.id}`}
            className="text-[10px] font-semibold uppercase tracking-wider text-[#718096] shrink-0"
          >
            Status
          </label>
          <Select
            id={`room-status-${room.id}`}
            aria-label={`Operational status for room ${room.roomNumber}`}
            value={room.status}
            disabled={statusSaving}
            onChange={(event) => onStatusChange(event.target.value as RoomStatus)}
            className="!h-8 !w-auto !text-xs !py-1"
            title={meta.description}
            options={ROOM_STATUS_OPTIONS}
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="outline"
            size="sm"
            icon={<Pencil className="w-3.5 h-3.5" />}
            onClick={onEdit}
            title={`Edit room ${room.roomNumber}`}
            className="!px-2"
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-3.5 h-3.5 text-[#EF4444]" />}
            onClick={onDelete}
            title={`Delete room ${room.roomNumber}`}
            className="!px-2"
          />
        </div>
      </div>
    </article>
  );
};
