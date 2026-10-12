const DAY_MS = 24 * 60 * 60 * 1000;

export function toDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function toISO(date) {
  const d = toDate(date);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(value, days) {
  const d = toDate(value);
  if (!d || !Number.isFinite(Number(days))) return null;
  d.setDate(d.getDate() + Number(days));
  return toISO(d);
}

export function diffDays(later, earlier) {
  const a = toDate(later);
  const b = toDate(earlier);
  if (!a || !b) return null;
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

export function maxDate(...values) {
  const valid = values.map(toDate).filter(Boolean);
  if (!valid.length) return null;
  return toISO(new Date(Math.max(...valid.map((d) => d.getTime()))));
}

export function minDate(...values) {
  const valid = values.map(toDate).filter(Boolean);
  if (!valid.length) return null;
  return toISO(new Date(Math.min(...valid.map((d) => d.getTime()))));
}

export function isWithin(value, start, end) {
  const d = toDate(value);
  const s = toDate(start);
  const e = toDate(end);
  if (!d || !s || !e) return false;
  return d >= s && d <= e;
}

export function enumerateDates(start, days) {
  const count = Math.max(0, Math.floor(Number(days) || 0));
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

export function todayISO() {
  return toISO(new Date());
}
