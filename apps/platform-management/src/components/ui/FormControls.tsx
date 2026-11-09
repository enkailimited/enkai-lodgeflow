import React from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { Button } from './Button';

export interface ValidationMessageProps {
  message?: string;
  type?: 'error' | 'hint';
}

export const ValidationMessage: React.FC<ValidationMessageProps> = ({
  message,
  type = 'error',
}) => {
  if (!message) return null;
  if (type === 'hint') {
    return <p className="text-[11px] text-[#718096] mt-1">{message}</p>;
  }
  return (
    <p className="text-[11px] text-[#EF4444] font-medium mt-1 flex items-center gap-1">
      <AlertCircle className="w-3 h-3 shrink-0" />
      <span>{message}</span>
    </p>
  );
};

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold text-[#152B4A] tracking-tight"
      >
        {label}
        {required && <span className="text-[#EF4444] ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <ValidationMessage message={error} type="error" />
      ) : (
        hint && <ValidationMessage message={hint} type="hint" />
      )}
    </div>
  );
};

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  mono?: boolean;
}

export const Input: React.FC<InputProps> = ({
  error,
  mono = false,
  className = '',
  ...props
}) => {
  return (
    <input
      {...props}
      className={`w-full h-9 px-3 text-xs sm:text-sm bg-white border ${
        error
          ? 'border-[#EF4444] focus:ring-[#EF4444]/20 focus:border-[#EF4444]'
          : 'border-[#E1EAF5] focus:ring-[#1769E8]/20 focus:border-[#1769E8]'
      } rounded-lg text-[#152B4A] placeholder:text-[#718096]/70 focus:outline-none focus:ring-2 transition-colors ${
        mono ? 'font-mono tabular-nums' : ''
      } ${className}`}
    />
  );
};

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
  error?: string;
}

export const Select: React.FC<SelectProps> = ({
  options,
  error,
  children,
  className = '',
  ...props
}) => {
  return (
    <select
      {...props}
      className={`w-full h-9 px-3 text-xs sm:text-sm bg-white border ${
        error
          ? 'border-[#EF4444] focus:ring-[#EF4444]/20 focus:border-[#EF4444]'
          : 'border-[#E1EAF5] focus:ring-[#1769E8]/20 focus:border-[#1769E8]'
      } rounded-lg text-[#152B4A] focus:outline-none focus:ring-2 transition-colors ${className}`}
    >
      {options
        ? options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))
        : children}
    </select>
  );
};

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea: React.FC<TextareaProps> = ({ error, className = '', ...props }) => {
  return (
    <textarea
      {...props}
      className={`w-full p-3 text-xs sm:text-sm bg-white border ${
        error
          ? 'border-[#EF4444] focus:ring-[#EF4444]/20 focus:border-[#EF4444]'
          : 'border-[#E1EAF5] focus:ring-[#1769E8]/20 focus:border-[#1769E8]'
      } rounded-lg text-[#152B4A] placeholder:text-[#718096]/70 focus:outline-none focus:ring-2 transition-colors ${className}`}
    />
  );
};

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}) => {
  return (
    <label
      className={`flex items-start gap-2.5 select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-[#E1EAF5] text-[#1769E8] focus:ring-[#1769E8]"
      />
      <div>
        <div className="text-xs sm:text-sm font-medium text-[#152B4A]">{label}</div>
        {description && <div className="text-xs text-[#718096]">{description}</div>}
      </div>
    </label>
  );
};

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}) => {
  return (
    <div className="flex items-center justify-between gap-3">
      {(label || description) && (
        <div>
          {label && <div className="text-xs sm:text-sm font-semibold text-[#152B4A]">{label}</div>}
          {description && <div className="text-xs text-[#718096]">{description}</div>}
        </div>
      )}
      <Button
        variant={checked ? 'primary' : 'outline'}
        size="sm"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`!w-11 !h-6 !p-0.5 !rounded-full transition-colors flex items-center ${
          checked
            ? '!bg-[#1769E8] justify-end'
            : '!bg-[#E1EAF5] hover:!bg-[#CBD5E1] justify-start !border-transparent'
        }`}
        title={label || 'Toggle switch'}
      >
        <span className="w-5 h-5 rounded-full bg-white shadow-xs block" />
      </Button>
    </div>
  );
};

export interface DatePickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  includeTime?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  includeTime = false,
  className = '',
  ...props
}) => {
  return (
    <Input
      type={includeTime ? 'datetime-local' : 'date'}
      mono
      className={className}
      {...props}
    />
  );
};

export interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}) => {
  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-9 pr-3 text-xs sm:text-sm bg-white border border-[#E1EAF5] rounded-lg text-[#152B4A] placeholder:text-[#718096] focus:outline-none focus:ring-2 focus:ring-[#1769E8]/20 focus:border-[#1769E8]"
      />
    </div>
  );
};

export interface FilterOption<T extends string = string> {
  id: T;
  label: string;
  count?: number;
}

export interface FilterBarProps<T extends string = string> {
  options: FilterOption<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  className?: string;
}

export function FilterBar<T extends string = string>({
  options,
  activeId,
  onSelect,
  className = '',
}: FilterBarProps<T>) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 p-1 bg-[#F5F8FD] border border-[#E1EAF5] rounded-xl ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt.id === activeId;
        return (
          <Button
            key={opt.id}
            variant={isActive ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onSelect(opt.id)}
            className={`!h-7 !px-3 !text-xs !rounded-lg ${
              isActive ? '' : '!text-[#718096] hover:!text-[#152B4A]'
            }`}
          >
            <span>{opt.label}</span>
            {typeof opt.count === 'number' && (
              <span
                className={`ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-[#E1EAF5] text-[#152B4A]'
                }`}
              >
                {opt.count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
