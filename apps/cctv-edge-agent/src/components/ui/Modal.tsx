import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button, ButtonVariant } from './Button';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  onConfirm?: () => void;
  loading?: boolean;
  confirmDisabled?: boolean;
  size?: ModalSize;
}

const SIZE_MAP: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  loading = false,
  confirmDisabled = false,
  size = 'md',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#061F43]/60 backdrop-blur-[2px] overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full ${SIZE_MAP[size]} bg-white border border-[#E1EAF5] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#E1EAF5] bg-[#F5F8FD]/60">
          <div>
            <h3 id="modal-title" className="text-base sm:text-lg font-bold text-[#152B4A]">
              {title}
            </h3>
            {description && (
              <p className="text-xs sm:text-sm text-[#718096] mt-0.5">{description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={loading}
            className="!px-2 !h-8 text-[#718096] hover:text-[#152B4A]"
            icon={<X className="w-4 h-4" />}
            title="Close dialog"
          />
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm text-[#152B4A]">{children}</div>

        {/* Footer */}
        {(footer || onConfirm) && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 px-5 py-3.5 border-t border-[#E1EAF5] bg-[#F5F8FD]/50">
            {footer ? (
              footer
            ) : (
              <>
                <Button variant="outline" size="md" onClick={onClose} disabled={loading}>
                  {cancelLabel}
                </Button>
                {onConfirm && (
                  <Button
                    variant={confirmVariant}
                    size="md"
                    onClick={onConfirm}
                    loading={loading}
                    disabled={confirmDisabled}
                  >
                    {confirmLabel || 'Confirm'}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'success';
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm Action',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      confirmVariant={variant}
      onConfirm={onConfirm}
      loading={loading}
    >
      <p className="text-sm text-[#718096] leading-relaxed">{description}</p>
    </Modal>
  );
};
