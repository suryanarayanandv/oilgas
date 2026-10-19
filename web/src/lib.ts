import { useCallback, useEffect, useState } from "react";
import type { DirectoryEntry, DirectoryFile, Job, JobsFile } from "../../shared/types";

declare const __REPO__: string;

// ---------- data ----------

export interface Data {
  generatedAt: string;
  jobs: Job[];
  companies: DirectoryEntry[];
  byId: Map<string, DirectoryEntry>;
}

async function load(bust: boolean): Promise<Data> {
  const q = bust ? `?t=${Date.now()}` : "";
  const [jobs, dir] = await Promise.all([
    fetch(`data/jobs.json${q}`, { cache: bust ? "no-store" : "default" }).then((r) => r.json() as Promise<JobsFile>),
    fetch(`data/directory.json${q}`, { cache: bust ? "no-store" : "default" }).then((r) => r.json() as Promise<DirectoryFile>),
  ]);
  return {
    generatedAt: jobs.generatedAt,
    jobs: jobs.jobs,
    companies: dir.companies,
    byId: new Map(dir.companies.map((c) => [c.id, c])),
  };
}

export function useData() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    load(false).then(setData, (e) => setError(String(e)));
  }, []);

  /** Re-download the snapshot, bypassing caches. Returns how many jobs are new vs the old copy. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await load(true);
      const before = new Set(data?.jobs.map((j) => j.id));
      setData(next);
      setError(null);
      return {
        changed: next.generatedAt !== data?.generatedAt,
        added: next.jobs.filter((j) => !before.has(j.id)).length,
      };
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [data]);

  return { data, error, refreshing, refresh };
}

// ---------- per-browser state (localStorage; every access guarded) ----------

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: state just won't persist */
  }
}

export function useStoredSet(key: string) {
  const [set, setSet] = useState<Set<string>>(() => new Set(read<string[]>(key, [])));
  const toggle = useCallback(
    (id: string) =>
      setSet((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        write(key, [...next]);
        return next;
      }),
    [key],
  );
  return [set, toggle] as const;
}

export function useStored<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => read(key, initial));
  const set = useCallback(
    (next: T) => {
      setV(next);
      write(key, next);
    },
    [key],
  );
  return [v, set] as const;
}

/**
 * "New since my last visit": the baseline is the previous visit's time, frozen for this
 * browser session so reloading the page doesn't clear the badges.
 */
export function visitBaseline(): string | null {
  try {
    let b = sessionStorage.getItem("baseline");
    if (b == null) {
      b = localStorage.getItem("lastVisit") ?? "";
      sessionStorage.setItem("baseline", b);
      localStorage.setItem("lastVisit", new Date().toISOString());
    }
    return b || null;
  } catch {
    return null;
  }
}

// ---------- repo links (GitHub Pages) ----------

export function repoSlug(): string | null {
  if (__REPO__) return __REPO__;
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = location.pathname.split("/").filter(Boolean)[0];
  return m && repo ? `${m[1]}/${repo}` : null;
}

export const WORKFLOW_FILE = "fetch-and-deploy.yml";

// ---------- formatting ----------

export function ago(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const ms = now - Date.parse(iso);
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function flag(iso?: string) {
  if (!iso || iso.length !== 2) return "";
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function toCsv(rows: (string | number | undefined)[][]) {
  return rows
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export function download(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
