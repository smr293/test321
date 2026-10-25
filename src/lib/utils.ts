import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(cents: number, currency = "SEK", locale = "sv-SE") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(
    (cents ?? 0) / 100,
  );
}

export function formatCompactMoney(cents: number, currency = "SEK", locale = "en-GB") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: cents >= 100000_00 ? "compact" : "standard",
    maximumFractionDigits: 0,
  }).format((cents ?? 0) / 100);
}

export function formatDate(d: Date | string | number | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", opts ?? { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function formatDateTime(d: Date | string | number | null | undefined) {
  return formatDate(d, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatTime(d: Date | string | number) {
  return formatDate(d, { hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(d: Date | string | number) {
  const date = d instanceof Date ? d : new Date(d);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60000) return "just now";
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(Math.round(diff / 60000), "minute");
}

export function daysUntil(d: Date | string | number) {
  const target = new Date(d).getTime();
  return Math.ceil((target - Date.now()) / 86400000);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function slugify(input: string) {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "gym";
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

export function monthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start, end };
}

export function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function titleCase(s: string) {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function truncate(s: string, n = 80) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
