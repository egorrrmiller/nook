import type { LucideIcon } from 'lucide-react';
import {
  AtSignIcon,
  CalendarIcon,
  CheckSquareIcon,
  ChevronDownCircleIcon,
  HashIcon,
  LinkIcon,
  ListIcon,
  PhoneIcon,
  TextIcon,
} from 'lucide-react';
import type { DateRange, PageProperty, PagePropertyType, PagePropertyValue } from '@nook/api-client';

export interface PropertyTypeMeta {
  type: PagePropertyType;
  label: string;
  icon: LucideIcon;
  hint: string;
}

export const PROPERTY_TYPES: PropertyTypeMeta[] = [
  { type: 'text', label: 'Text', icon: TextIcon, hint: 'Plain text' },
  { type: 'number', label: 'Number', icon: HashIcon, hint: 'Numbers with decimals' },
  { type: 'select', label: 'Select', icon: ChevronDownCircleIcon, hint: 'One option' },
  { type: 'multi_select', label: 'Multi-select', icon: ListIcon, hint: 'Several options' },
  { type: 'date', label: 'Date', icon: CalendarIcon, hint: 'A day or a range' },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquareIcon, hint: 'Yes / no' },
  { type: 'url', label: 'URL', icon: LinkIcon, hint: 'Web address' },
  { type: 'email', label: 'Email', icon: AtSignIcon, hint: 'Email address' },
  { type: 'phone', label: 'Phone', icon: PhoneIcon, hint: 'Phone number' },
];

export function propertyMeta(type: PagePropertyType): PropertyTypeMeta {
  return PROPERTY_TYPES.find((t) => t.type === type) ?? PROPERTY_TYPES[0]!;
}

export function defaultValue(type: PagePropertyType): PagePropertyValue {
  switch (type) {
    case 'checkbox':
      return false;
    case 'multi_select':
      return [];
    default:
      return null;
  }
}

export function isDateRange(v: PagePropertyValue): v is DateRange {
  return !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as DateRange).start === 'string';
}

/** Best-effort conversion when the user changes a property's type. */
export function coerceValue(to: PagePropertyType, prop: PageProperty): PagePropertyValue {
  const v = prop.value;
  const asText = formatValue(prop);
  switch (to) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return asText || null;
    case 'number': {
      const n = typeof v === 'number' ? v : Number.parseFloat(asText.replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    case 'checkbox':
      return typeof v === 'boolean' ? v : asText.trim().length > 0;
    case 'select':
      if (Array.isArray(v)) return v[0] ?? null;
      return asText || null;
    case 'multi_select':
      if (Array.isArray(v)) return v;
      return asText ? asText.split(',').map((s) => s.trim()).filter(Boolean) : [];
    case 'date':
      if (isDateRange(v)) return v;
      return /^\d{4}-\d{2}-\d{2}/.test(asText) ? { start: asText.slice(0, 10) } : null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()\-.]{5,}$/;

/** Returns an error message or null. */
export function validateValue(type: PagePropertyType, value: PagePropertyValue): string | null {
  if (value === null || value === '' || value === undefined) return null;
  switch (type) {
    case 'url': {
      if (typeof value !== 'string') return 'Expected a URL';
      try {
        const u = new URL(value.includes('://') ? value : `https://${value}`);
        return u.hostname.includes('.') || u.hostname === 'localhost' ? null : 'Enter a valid URL';
      } catch {
        return 'Enter a valid URL';
      }
    }
    case 'email':
      return typeof value === 'string' && EMAIL_RE.test(value) ? null : 'Enter a valid email';
    case 'phone':
      return typeof value === 'string' && PHONE_RE.test(value) ? null : 'Enter a valid phone number';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'Enter a number';
    case 'date':
      return isDateRange(value) ? null : 'Enter a date';
    default:
      return null;
  }
}

/** Normalises a URL for opening: adds https:// when the scheme is missing. */
export function hrefForUrl(value: string): string {
  return value.includes('://') ? value : `https://${value}`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function formatIsoDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export function formatValue(prop: PageProperty): string {
  const v = prop.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return new Intl.NumberFormat().format(v);
  if (Array.isArray(v)) return v.join(', ');
  if (isDateRange(v)) return v.end ? `${formatIsoDate(v.start)} → ${formatIsoDate(v.end)}` : formatIsoDate(v.start);
  return String(v);
}

/** `YYYY-MM-DD` in local time. */
export function toIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
