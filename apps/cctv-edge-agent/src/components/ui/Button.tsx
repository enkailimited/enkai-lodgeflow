import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'success';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label?: string;
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  title?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#1769E8] hover:bg-[#1258C8] active:bg-[#0D47A1] text-white border border-transparent shadow-xs',
  secondary:
    'bg-[#EAF3FF] hover:bg-[#D8E8FF] active:bg-[#C6DFFF] text-[#082B59] border border-[#CFE2FF]',
  outline:
    'bg-white hover:bg-[#F5F8FD] active:bg-[#EAF3FF] text-[#152B4A] border border-[#E1EAF5] hover:border-[#1769E8]/50',
  ghost:
    'bg-transparent hover:bg-[#EAF3FF]/70 active:bg-[#EAF3FF] text-[#152B4A] border border-transparent',
  danger:
    'bg-[#EF4444] hover:bg-[#DC2626] active:bg-[#B91C1C] text-white border border-transparent shadow-xs',
  success:
    'bg-[#12B981] hover:bg-[#0EA572] active:bg-[#0B8A5E] text-white border border-transparent shadow-xs',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-xs sm:text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2.5 rounded-xl',
};

export const Button: React.FC<ButtonProps> = ({
  label,
  children,
  variant = 'primary',
  size = 'md',
  icon,
  rightIcon,
  disabled = false,
  loading = false,
  loadingText,
  fullWidth = false,
  type = 'button',
  onClick,
  className = '',
  title,
}) => {
  const isDisabled = disabled || loading;
  const content = children ?? label;

  return (
    <button
      type={type}
      disabled={isDisabled}
      title={title}
      onClick={(e) => {
        if (isDisabled) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 whitespace-nowrap shrink-0 select-none focus:outline-none focus:ring-2 focus:ring-[#1769E8]/30 ${
        VARIANT_CLASSES[variant]
      } ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${
        isDisabled ? 'opacity-55 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
      } ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>{loadingText || content}</span>
        </>
      ) : (
        <>
          {icon && <span className="shrink-0 flex items-center">{icon}</span>}
          {content && <span>{content}</span>}
          {rightIcon && <span className="shrink-0 flex items-center">{rightIcon}</span>}
        </>
      )}
    </button>
  );
};
