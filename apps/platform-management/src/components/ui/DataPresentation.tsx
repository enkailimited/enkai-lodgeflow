import React from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Footprints,
  HelpCircle,
  RotateCcw,
} from 'lucide-react';
import { Button } from './Button';
import { StatusBadge, SkeletonLoader, EmptyState } from './StatusComponents';
import { EnrichedRoomEvent, EventType } from '../../types/lodgeflow';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  actions,
  meta,
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-1">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] border border-[#CFE2FF] text-[#1769E8] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-[#082B59] tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-[#718096] mt-0.5">{subtitle}</p>
          )}
          {meta && <div className="mt-1.5">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
};

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  rightContent?: React.ReactNode;
  darkHeader?: boolean;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  icon,
  rightContent,
  darkHeader = false,
}) => {
  if (darkHeader) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#082B59] text-white rounded-t-2xl">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-white shrink-0">{icon}</span>}
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white leading-tight">{title}</h2>
            {subtitle && <p className="text-[11px] text-white/75">{subtitle}</p>}
          </div>
        </div>
        {rightContent && <div className="shrink-0">{rightContent}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E1EAF5]">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="w-7 h-7 rounded-lg bg-[#EAF3FF] text-[#1769E8] flex items-center justify-center shrink-0">
            {icon}
          </span>
        )}
        <div>
          <h2 className="text-sm sm:text-base font-bold text-[#152B4A] leading-tight">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-[#718096] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {rightContent && <div className="flex items-center gap-2 shrink-0">{rightContent}</div>}
    </div>
  );
};

export interface StatCardProps {
  label: string;
  value: string | number;
  supportingText: string;
  icon: React.ReactNode;
  iconTone?: 'blue' | 'green' | 'navy' | 'amber';
  /** Optional 0..100 ring indicator on the right side of the card */
  ringPercentage?: number | null;
  ringColor?: string;
  /** Optional right status badge or check icon */
  rightAccessory?: React.ReactNode;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  supportingText,
  icon,
  iconTone = 'blue',
  ringPercentage,
  ringColor = '#12B981',
  rightAccessory,
  onClick,
}) => {
  const iconColors = {
    blue: 'text-[#1769E8] bg-[#EAF3FF]',
    green: 'text-[#12B981] bg-[#12B981]/12',
    navy: 'text-[#082B59] bg-[#082B59]/10',
    amber: 'text-[#F5A623] bg-[#F5A623]/12',
  }[iconTone];

  const radius = 18;
  const stroke = 4;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const clampedPct =
    typeof ringPercentage === 'number'
      ? Math.max(0, Math.min(100, ringPercentage))
      : 0;
  const strokeDashoffset = circumference - (clampedPct / 100) * circumference;

  return (
    <div
      onClick={onClick}
      className={`bg-white border border-[#E1EAF5] rounded-2xl p-4 shadow-2xs flex items-center justify-between gap-3 transition-all ${
        onClick ? 'cursor-pointer hover:border-[#1769E8]/50 hover:shadow-sm' : ''
      }`}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconColors}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-[#718096] truncate">{label}</div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#152B4A] font-mono tabular-nums leading-tight mt-0.5">
            {value}
          </div>
          <div className="text-[11px] font-medium text-[#718096] truncate mt-0.5">
            {supportingText}
          </div>
        </div>
      </div>

      {typeof ringPercentage === 'number' && (
        <div className="shrink-0 flex items-center justify-center">
          <svg height={radius * 2} width={radius * 2} className="-rotate-90">
            <circle
              stroke="#E1EAF5"
              fill="transparent"
              strokeWidth={stroke}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
            <circle
              stroke={ringColor}
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={`${circumference} ${circumference}`}
              style={{ strokeDashoffset }}
              strokeLinecap="round"
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
          </svg>
        </div>
      )}

      {rightAccessory && <div className="shrink-0">{rightAccessory}</div>}
    </div>
  );
};

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyTitle = 'No records available',
  emptyDescription = 'Records will appear here once data is generated or analyzed.',
  onRowClick,
}: DataTableProps<T>) {
  if (loading) {
    return <SkeletonLoader rows={4} variant="table" />;
  }

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} compact />;
  }

  return (
    <div className="overflow-x-auto border border-[#E1EAF5] rounded-xl bg-white">
      <table className="w-full text-left border-collapse text-xs sm:text-sm">
        <thead>
          <tr className="bg-[#F5F8FD] text-[#152B4A] border-b border-[#E1EAF5]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-3 px-3.5 font-bold text-xs tracking-tight whitespace-nowrap ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left'
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E1EAF5]">
          {data.map((row, idx) => (
            <tr
              key={rowKey(row, idx)}
              onClick={() => onRowClick?.(row)}
              className={`transition-colors ${
                onRowClick
                  ? 'cursor-pointer hover:bg-[#EAF3FF]/60'
                  : 'hover:bg-[#F5F8FD]/70'
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`py-2.5 px-3.5 text-xs sm:text-sm text-[#152B4A] ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  }`}
                >
                  {col.render(row, idx)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
}) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-[#718096]">
      <div>
        Page <strong className="text-[#152B4A] font-mono">{currentPage}</strong> of{' '}
        <strong className="text-[#152B4A] font-mono">{totalPages}</strong>
        {typeof totalItems === 'number' && ` (${totalItems} total)`}
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          icon={<ChevronLeft className="w-3.5 h-3.5" />}
        >
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export interface EventCardProps {
  event: EnrichedRoomEvent;
  onClick?: () => void;
  compact?: boolean;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  onClick,
  compact = false,
}) => {
  const getEventStyle = (type: EventType) => {
    switch (type) {
      case 'ENTRY':
        return {
          bg: 'bg-[#12B981]',
          text: 'text-[#12B981]',
          badgeTone: 'success' as const,
          icon: <LogIn className="w-3.5 h-3.5 text-white" />,
        };
      case 'RE_ENTRY':
        return {
          bg: 'bg-[#12B981]',
          text: 'text-[#12B981]',
          badgeTone: 'success' as const,
          icon: <RotateCcw className="w-3.5 h-3.5 text-white" />,
        };
      case 'EXIT':
        return {
          bg: 'bg-[#1769E8]',
          text: 'text-[#1769E8]',
          badgeTone: 'info' as const,
          icon: <LogOut className="w-3.5 h-3.5 text-white" />,
        };
      case 'CORRIDOR_PASS':
        return {
          bg: 'bg-[#F5A623]',
          text: 'text-[#F5A623]',
          badgeTone: 'warning' as const,
          icon: <Footprints className="w-3.5 h-3.5 text-white" />,
        };
      default:
        return {
          bg: 'bg-[#718096]',
          text: 'text-[#718096]',
          badgeTone: 'neutral' as const,
          icon: <HelpCircle className="w-3.5 h-3.5 text-white" />,
        };
    }
  };

  const style = getEventStyle(event.event_type);

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#F5F8FD] hover:bg-[#EAF3FF]/70 border border-[#E1EAF5] transition-colors ${
          onClick ? 'cursor-pointer' : ''
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-7 h-7 rounded-full ${style.bg} flex items-center justify-center shrink-0 shadow-2xs`}
          >
            {style.icon}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm min-w-0">
            <span className="font-bold text-[#152B4A]">{event.event_type}</span>
            <span className="text-[#718096]">—</span>
            <span className="font-medium text-[#152B4A]">{event.room_id}</span>
            <span className="text-[#718096]">—</span>
            <span className="text-[#718096] font-medium">{event.person_id}</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <StatusBadge
            label={event.verification_status}
            tone={event.verification_status === 'CONFIRMED' ? 'success' : 'warning'}
          />
          <span className="text-xs font-mono font-semibold text-[#152B4A] tabular-nums">
            {event.dar_es_salaam_clock_time || event.formatted_relative_time}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`p-3.5 rounded-xl bg-white hover:bg-[#F5F8FD] border border-[#E1EAF5] transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 rounded-full ${style.bg} flex items-center justify-center shrink-0 mt-0.5 shadow-2xs`}
        >
          {style.icon}
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-bold text-[#1769E8] tabular-nums">
              {event.formatted_relative_time}
            </span>
            <span className="font-bold text-[#152B4A]">{event.event_type}</span>
            <span className="text-[#718096]">·</span>
            <span className="font-semibold text-[#152B4A]">{event.person_id}</span>
            <StatusBadge
              label={event.verification_status}
              tone={event.verification_status === 'CONFIRMED' ? 'success' : 'warning'}
            />
          </div>
          <p className="text-xs text-[#718096] leading-relaxed">
            {event.evidence_description}
          </p>
          <div className="text-[11px] text-[#718096]/90 font-mono">
            Engine Rule: {event.engine_note}
          </div>
        </div>
      </div>
      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 text-right font-mono text-xs shrink-0 tabular-nums">
        <div className="font-bold text-[#082B59]">
          Occupancy: {event.occupancy_after_event}
        </div>
        <div
          className="text-[11px] text-[#718096]"
          title="Model-reported score, not independently verified accuracy"
        >
          Model Conf: {Math.round(event.confidence * 100)}%
        </div>
      </div>
    </div>
  );
};

export interface ActivityTimelineProps {
  events: EnrichedRoomEvent[];
  onSelectEvent?: (event: EnrichedRoomEvent) => void;
  emptyMessage?: string;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  events,
  onSelectEvent,
  emptyMessage = 'No CCTV corridor events recorded yet. Upload and analyze a video clip to populate the timeline.',
}) => {
  if (events.length === 0) {
    return (
      <EmptyState
        title="No Events Detected Yet"
        description={emptyMessage}
        compact
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {events.map((ev) => (
        <EventCard
          key={ev.event_id}
          event={ev}
          onClick={onSelectEvent ? () => onSelectEvent(ev) : undefined}
        />
      ))}
    </div>
  );
};

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  rightControls?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  icon,
  rightControls,
  children,
  className = '',
}) => {
  return (
    <div
      className={`bg-white border border-[#E1EAF5] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4 ${className}`}
    >
      <SectionHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        rightContent={rightControls}
      />
      <div>{children}</div>
    </div>
  );
};
