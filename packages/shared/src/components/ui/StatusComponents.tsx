import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Loader2,
  RotateCcw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from './Button';

export type BadgeTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'navy';

export interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  mono?: boolean;
  className?: string;
}

const TONE_STYLES: Record<BadgeTone, string> = {
  success: 'bg-[#12B981]/12 text-[#0D9468] border-[#12B981]/25',
  warning: 'bg-[#F5A623]/12 text-[#B87503] border-[#F5A623]/30',
  danger: 'bg-[#EF4444]/12 text-[#DC2626] border-[#EF4444]/25',
  info: 'bg-[#EAF3FF] text-[#1769E8] border-[#1769E8]/20',
  neutral: 'bg-[#F5F8FD] text-[#718096] border-[#E1EAF5]',
  navy: 'bg-[#082B59] text-white border-[#082B59]',
};

const DOT_STYLES: Record<BadgeTone, string> = {
  success: 'bg-[#12B981]',
  warning: 'bg-[#F5A623]',
  danger: 'bg-[#EF4444]',
  info: 'bg-[#1769E8]',
  neutral: 'bg-[#718096]',
  navy: 'bg-[#3188F5]',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  tone = 'info',
  dot = false,
  mono = false,
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full border whitespace-nowrap shrink-0 ${
        TONE_STYLES[tone]
      } ${mono ? 'font-mono tabular-nums' : ''} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${DOT_STYLES[tone]}`} />}
      <span>{label}</span>
    </span>
  );
};

export interface ConnectionStatusProps {
  online: boolean;
  label?: string;
  sublabel?: string;
  variant?: 'sidebar' | 'pill' | 'inline';
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  online,
  label,
  sublabel,
  variant = 'pill',
}) => {
  if (variant === 'sidebar') {
    return (
      <div className="p-3 rounded-xl bg-[#061F43]/90 border border-white/10 flex items-center gap-3">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            online ? 'bg-[#12B981]/20 text-[#12B981]' : 'bg-[#F5A623]/20 text-[#F5A623]'
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              online ? 'bg-[#12B981] animate-pulse' : 'bg-[#F5A623]'
            }`}
          />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-white flex items-center gap-1">
            <span className={online ? 'text-[#12B981]' : 'text-[#F5A623]'}>
              {online ? 'System' : 'Status'}
            </span>
            <span>{label || (online ? 'Online' : 'Standby')}</span>
          </div>
          <div className="text-[11px] text-white/65 truncate">
            {sublabel || (online ? 'All Systems Operational' : 'Checking Gemini API...')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
        online
          ? 'bg-[#12B981] text-white'
          : 'bg-[#718096]/20 text-[#718096] border border-[#E1EAF5]'
      }`}
    >
      {online ? (
        <>
          <span className="w-2 h-2 rounded-full bg-white" />
          <span>{label || 'Online'}</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          <span>{label || 'Disconnected'}</span>
        </>
      )}
    </span>
  );
};

export interface ConfidenceIndicatorProps {
  /** Confidence value 0..100 or null when no analysis has been run */
  percentage: number | null;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showDisclaimer?: boolean;
}

export const ConfidenceIndicator: React.FC<ConfidenceIndicatorProps> = ({
  percentage,
  size = 'md',
  label = 'Overall Confidence',
  showDisclaimer = false,
}) => {
  const pct = percentage !== null ? Math.max(0, Math.min(100, Math.round(percentage))) : 0;
  const color =
    percentage === null
      ? '#CBD5E1'
      : pct >= 80
      ? '#12B981'
      : pct >= 60
      ? '#F5A623'
      : '#EF4444';

  if (size === 'sm') {
    return (
      <div className="inline-flex items-center gap-2 font-mono text-xs tabular-nums">
        <div className="w-16 h-1.5 bg-[#E1EAF5] rounded-full overflow-hidden">
          <div
            style={{ width: `${pct}%`, backgroundColor: color }}
            className="h-full rounded-full transition-all duration-300"
          />
        </div>
        <span className="font-semibold text-[#152B4A]">
          {percentage !== null ? `${pct}%` : '—'}
        </span>
      </div>
    );
  }

  const radius = size === 'lg' ? 42 : 34;
  const stroke = size === 'lg' ? 8 : 7;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset =
    percentage !== null ? circumference - (pct / 100) * circumference : circumference;

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative inline-flex items-center justify-center">
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
            stroke={color}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{ strokeDashoffset }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg sm:text-xl font-extrabold text-[#152B4A] font-mono tabular-nums">
            {percentage !== null ? `${pct}%` : '—'}
          </span>
        </div>
      </div>
      {label && (
        <span className="text-xs font-semibold text-[#152B4A] mt-1.5 leading-tight">
          {label}
        </span>
      )}
      {showDisclaimer && (
        <span className="text-[10px] text-[#718096] mt-0.5">
          Model-reported score
        </span>
      )}
    </div>
  );
};

export interface ProgressIndicatorProps {
  value: number; // 0 to 100
  label?: string;
  sublabel?: string;
  tone?: 'blue' | 'success' | 'warning';
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  value,
  label,
  sublabel,
  tone = 'blue',
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const barColor =
    tone === 'success'
      ? 'bg-[#12B981]'
      : tone === 'warning'
      ? 'bg-[#F5A623]'
      : 'bg-[#1769E8]';

  return (
    <div className="w-full space-y-1.5">
      {(label || sublabel) && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[#152B4A]">{label}</span>
          <span className="font-mono text-[#718096] tabular-nums">
            {sublabel || `${clamped}%`}
          </span>
        </div>
      )}
      <div className="w-full h-2 bg-[#EAF3FF] rounded-full overflow-hidden">
        <div
          style={{ width: `${clamped}%` }}
          className={`h-full ${barColor} rounded-full transition-all duration-300`}
        />
      </div>
    </div>
  );
};

export const LoadingSpinner: React.FC<{ label?: string; size?: 'sm' | 'md' | 'lg' }> = ({
  label,
  size = 'md',
}) => {
  const dim = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
  return (
    <div className="inline-flex items-center gap-2 text-[#1769E8]">
      <Loader2 className={`${dim} animate-spin shrink-0`} />
      {label && <span className="text-xs sm:text-sm font-medium text-[#152B4A]">{label}</span>}
    </div>
  );
};

export const SkeletonLoader: React.FC<{
  rows?: number;
  variant?: 'card' | 'table' | 'kpi';
}> = ({ rows = 3, variant = 'card' }) => {
  if (variant === 'kpi') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-[#E1EAF5] rounded-2xl p-4 animate-pulse space-y-3"
          >
            <div className="h-3 w-24 bg-[#EAF3FF] rounded" />
            <div className="h-7 w-16 bg-[#EAF3FF] rounded" />
            <div className="h-2.5 w-20 bg-[#F5F8FD] rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 w-full bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl"
        />
      ))}
    </div>
  );
};

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  compact = false,
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center bg-[#F5F8FD]/70 border border-dashed border-[#CBD5E1] rounded-2xl ${
        compact ? 'p-6' : 'p-8 sm:p-10'
      }`}
    >
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-[#EAF3FF] text-[#1769E8] flex items-center justify-center mb-3 shadow-2xs">
          {icon}
        </div>
      )}
      <h3 className="text-sm sm:text-base font-bold text-[#152B4A]">{title}</h3>
      <p className="text-xs sm:text-sm text-[#718096] max-w-md mt-1 leading-relaxed">
        {description}
      </p>
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
          {actionLabel && onAction && (
            <Button variant="primary" size="md" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="outline" size="md" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export interface ErrorStateProps {
  code?: string;
  message: string;
  detail?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  code,
  message,
  detail,
  onRetry,
  onDismiss,
}) => {
  return (
    <div
      role="alert"
      className="p-4 rounded-2xl bg-[#FEF2F2] border border-[#EF4444]/30 text-[#152B4A] flex flex-col sm:flex-row sm:items-start justify-between gap-4 shadow-xs"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#EF4444]/15 text-[#EF4444] flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          {code && (
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#EF4444]">
              Error Code: {code}
            </div>
          )}
          <p className="text-xs sm:text-sm font-semibold text-[#152B4A]">{message}</p>
          {detail && (
            <p className="text-xs font-mono text-[#718096] break-all bg-white/80 px-2.5 py-1.5 rounded-lg border border-[#EF4444]/15">
              {detail}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRetry && (
          <Button
            variant="danger"
            size="sm"
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={onRetry}
          >
            Retry
          </Button>
        )}
        {onDismiss && (
          <Button variant="outline" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
};

export interface SuccessStateProps {
  title: string;
  message?: string;
  onDismiss?: () => void;
}

export const SuccessState: React.FC<SuccessStateProps> = ({
  title,
  message,
  onDismiss,
}) => {
  return (
    <div className="p-3.5 rounded-xl bg-[#ECFDF5] border border-[#12B981]/30 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <CheckCircle2 className="w-5 h-5 text-[#12B981] shrink-0" />
        <div>
          <div className="text-xs sm:text-sm font-bold text-[#065F46]">{title}</div>
          {message && <div className="text-xs text-[#047857]">{message}</div>}
        </div>
      </div>
      {onDismiss && (
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Close
        </Button>
      )}
    </div>
  );
};
