/**
 * Generic validation helpers for ERP endpoints.
 */

export class ValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super('Please correct the highlighted fields.');
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export function asString(
  raw: unknown,
  field: string,
  opts: { required?: boolean; max?: number; min?: number } = {}
): string | null {
  if (raw === undefined || raw === null) {
    if (opts.required) throw new ValidationError({ [field]: 'This field is required.' });
    return null;
  }
  const value = String(raw).trim();
  if (!value) {
    if (opts.required) throw new ValidationError({ [field]: 'This field is required.' });
    return null;
  }
  if (opts.min !== undefined && value.length < opts.min) {
    throw new ValidationError({ [field]: `Must be at least ${opts.min} characters.` });
  }
  if (opts.max !== undefined && value.length > opts.max) {
    throw new ValidationError({ [field]: `Must be at most ${opts.max} characters.` });
  }
  return value;
}

export function asEmail(raw: unknown, field = 'email', required = false): string | null {
  const value = asString(raw, field, { required, max: 254 });
  if (!value) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new ValidationError({ [field]: 'Enter a valid email address.' });
  }
  return value.toLowerCase();
}

export function asInt(
  raw: unknown,
  field: string,
  opts: { required?: boolean; min?: number; max?: number; fallback?: number } = {}
): number | null {
  if (raw === undefined || raw === null || raw === '') {
    if (opts.required) throw new ValidationError({ [field]: 'This field is required.' });
    return opts.fallback ?? null;
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new ValidationError({ [field]: 'Must be a whole number.' });
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new ValidationError({ [field]: `Must be at least ${opts.min}.` });
  }
  if (opts.max !== undefined && value > opts.max) {
    throw new ValidationError({ [field]: `Must be at most ${opts.max}.` });
  }
  return value;
}

export function asMoney(
  raw: unknown,
  field: string,
  opts: { required?: boolean; min?: number } = {}
): number | null {
  if (raw === undefined || raw === null || raw === '') {
    if (opts.required) throw new ValidationError({ [field]: 'This field is required.' });
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ValidationError({ [field]: 'Must be a valid amount.' });
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new ValidationError({ [field]: `Must be at least ${opts.min}.` });
  }
  if (value > 9_999_999_999.99) {
    throw new ValidationError({ [field]: 'Amount is too large.' });
  }
  return Math.round(value * 100) / 100;
}

export function asDate(raw: unknown, field: string, required = true): string | null {
  const value = asString(raw, field, { required });
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError({ [field]: 'Use the YYYY-MM-DD date format.' });
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError({ [field]: 'Enter a valid date.' });
  }
  return value;
}

export function asEnum<T extends string>(
  raw: unknown,
  field: string,
  allowed: readonly T[],
  opts: { required?: boolean; fallback?: T } = {}
): T | null {
  if (raw === undefined || raw === null || raw === '') {
    if (opts.required) throw new ValidationError({ [field]: 'This field is required.' });
    return opts.fallback ?? null;
  }
  const value = String(raw).trim().toUpperCase() as T;
  if (!allowed.includes(value)) {
    throw new ValidationError({ [field]: `Must be one of: ${allowed.join(', ')}.` });
  }
  return value;
}

export function pagination(query: Record<string, unknown>): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(query.offset ?? 0) || 0, 0);
  return { limit, offset };
}
