// Normalizes the many date formats ATSs return into YYYY-MM-DD.

const day = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function parsePosted(input: unknown, now = new Date()): string | undefined {
  if (input == null || input === "") return undefined;
  if (typeof input === "number") {
    // epoch seconds or ms
    const ms = input < 1e12 ? input * 1000 : input;
    return iso(new Date(ms));
  }
  const s = String(input).trim().replace(/\bSept\b/i, "Sep");
  const low = s.toLowerCase();
  if (/posted today|just posted|^today/.test(low)) return iso(now);
  if (/yesterday/.test(low)) return iso(new Date(now.getTime() - day));
  const rel = low.match(/(\d+)\+?\s*(day|week|month|hour)s?\s*ago/);
  if (rel) {
    const n = Number(rel[1]);
    const mult = { hour: day / 24, day, week: 7 * day, month: 30 * day }[rel[2] as "day"];
    return iso(new Date(now.getTime() - n * mult));
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Numeric dates: "/" is usually US month-first in ATS output, "." and "-" day-first.
  // A part greater than 12 settles it either way.
  const num = s.match(/^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/);
  if (num) {
    const [a, b] = [Number(num[1]), Number(num[3])];
    const monthFirst = a > 12 ? false : b > 12 ? true : num[2] === "/";
    const [m, d] = monthFirst ? [a, b] : [b, a];
    return `${num[4]}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // "Oct 3, 2026", "3 October 2026": parsed as local midnight, so format with local fields.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return undefined;
}
