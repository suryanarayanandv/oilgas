import { useDeferredValue, useMemo, useState } from "react";
import type { Job } from "../../shared/types";
import { COUNTRY_NAME, COUNTRY_REGION } from "../../shared/geo";
import { ago, download, flag, toCsv, useStored, type Data } from "./lib";

interface Props {
  data: Data;
  savedOnly: boolean;
  saved: Set<string>;
  hidden: Set<string>;
  toggleSaved: (id: string) => void;
  toggleHidden: (id: string) => void;
  baseline: string | null;
}

interface Filters {
  q: string;
  match: "core" | "all";
  region: string;
  country: string;
  category: string;
  days: number;
  newOnly: boolean;
  showHidden: boolean;
  sort: "newest" | "relevance" | "company";
}

const DEFAULTS: Filters = {
  q: "", match: "core", region: "", country: "", category: "", days: 0,
  newOnly: false, showHidden: false, sort: "newest",
};

const PAGE = 60;

// Job boards we don't scrape (their terms forbid it), offered as one-click searches instead.
const BOARDS: [string, (q: string) => string][] = [
  ["LinkedIn", (q) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}`],
  ["Indeed", (q) => `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}`],
  ["Bayt", (q) => `https://www.bayt.com/en/international/jobs/${q.toLowerCase().replace(/\s+/g, "-")}-jobs/`],
  ["NaukriGulf", (q) => `https://www.naukrigulf.com/${q.toLowerCase().replace(/\s+/g, "-")}-jobs`],
  ["Rigzone", (q) => `https://www.rigzone.com/oil/jobs/search/?sk=${encodeURIComponent(q)}`],
  ["GulfTalent", (q) => `https://www.gulftalent.com/jobs/search?keywords=${encodeURIComponent(q)}`],
];

export function JobsView({ data, savedOnly, saved, hidden, toggleSaved, toggleHidden, baseline }: Props) {
  const [f, setF] = useStored<Filters>("filters", DEFAULTS);
  const filters = { ...DEFAULTS, ...f };
  const set = (patch: Partial<Filters>) => setF({ ...filters, ...patch });
  const q = useDeferredValue(filters.q.trim().toLowerCase());
  const [limit, setLimit] = useState(PAGE);

  const isNew = (j: Job) => (baseline ? j.firstSeenAt > baseline : false);

  // Undated jobs found by the very first scan have no meaningful "seen" date, so they sort
  // after dated ones; undated jobs discovered by later scans sort by when they appeared.
  const backfillEnd = useMemo(() => {
    const first = data.jobs.reduce((m, j) => (j.firstSeenAt < m ? j.firstSeenAt : m), data.generatedAt);
    return new Date(Date.parse(first) + 3_600_000).toISOString();
  }, [data]);

  const regions = useMemo(() => [...new Set(Object.values(COUNTRY_REGION))].sort(), []);
  const countries = useMemo(() => {
    const present = new Set(data.jobs.map((j) => j.country).filter(Boolean) as string[]);
    return [...present]
      .filter((c) => !filters.region || COUNTRY_REGION[c] === filters.region)
      .sort((a, b) => (COUNTRY_NAME[a] ?? a).localeCompare(COUNTRY_NAME[b] ?? b));
  }, [data, filters.region]);
  const categories = useMemo(() => [...new Set(data.companies.map((c) => c.category))].sort(), [data]);

  const list = useMemo(() => {
    const cutoff = filters.days ? Date.now() - filters.days * 86_400_000 : 0;
    const out = data.jobs.filter((j) => {
      const c = data.byId.get(j.companyId);
      if (savedOnly) return saved.has(j.id);
      if (!filters.showHidden && hidden.has(j.id)) return false;
      if (filters.match === "core" && j.tier !== "core") return false;
      if (filters.region && (j.country ? COUNTRY_REGION[j.country] : c?.region) !== filters.region) return false;
      if (filters.country && j.country !== filters.country) return false;
      if (filters.category && c?.category !== filters.category) return false;
      if (cutoff && Date.parse(j.postedAt ?? j.firstSeenAt) < cutoff) return false;
      if (filters.newOnly && !isNew(j)) return false;
      if (q && !`${j.title} ${j.location} ${c?.name} ${COUNTRY_NAME[j.country ?? ""] ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
    const name = (j: Job) => data.byId.get(j.companyId)?.name ?? "";
    const date = (j: Job) => j.postedAt ?? (j.firstSeenAt > backfillEnd ? j.firstSeenAt.slice(0, 10) : "");
    out.sort(
      filters.sort === "relevance"
        ? (a, b) => b.score - a.score || date(b).localeCompare(date(a))
        : filters.sort === "company"
          ? (a, b) => name(a).localeCompare(name(b)) || date(b).localeCompare(date(a))
          : (a, b) => date(b).localeCompare(date(a)) || b.score - a.score,
    );
    return out;
  }, [data, filters, q, savedOnly, saved, hidden, baseline, backfillEnd]);

  function exportCsv() {
    const rows = list.map((j) => {
      const c = data.byId.get(j.companyId);
      return [j.title, c?.name, j.location, COUNTRY_NAME[j.country ?? ""] ?? "", j.postedAt, j.url];
    });
    download(
      savedOnly ? "saved-safety-jobs.csv" : "safety-jobs.csv",
      toCsv([["Title", "Company", "Location", "Country", "Posted", "URL"], ...rows]),
    );
  }

  const newCount = data.jobs.filter((j) => isNew(j) && j.tier === "core").length;

  return (
    <>
      {!savedOnly && (
        <div className="filters">
          <input
            className="search"
            type="search"
            placeholder="Search title, company, city…"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            aria-label="Search jobs"
          />
          <div className="seg" role="group" aria-label="Role match">
            <button className={filters.match === "core" ? "on" : ""} onClick={() => set({ match: "core" })}>
              Core safety
            </button>
            <button className={filters.match === "all" ? "on" : ""} onClick={() => set({ match: "all" })}>
              + Related HSE
            </button>
          </div>
          <select value={filters.region} onChange={(e) => set({ region: e.target.value, country: "" })} aria-label="Region">
            <option value="">All regions</option>
            {regions.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select value={filters.country} onChange={(e) => set({ country: e.target.value })} aria-label="Country">
            <option value="">All countries</option>
            {countries.map((c) => <option key={c} value={c}>{flag(c)} {COUNTRY_NAME[c] ?? c}</option>)}
          </select>
          <select value={filters.category} onChange={(e) => set({ category: e.target.value })} aria-label="Company type">
            <option value="">All company types</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={filters.days} onChange={(e) => set({ days: Number(e.target.value) })} aria-label="Posted within">
            <option value={0}>Any date</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <select value={filters.sort} onChange={(e) => set({ sort: e.target.value as Filters["sort"] })} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="relevance">Best match</option>
            <option value="company">Company A–Z</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={filters.newOnly} onChange={(e) => set({ newOnly: e.target.checked })} />
            New since last visit{newCount ? ` (${newCount})` : ""}
          </label>
          <label className="check">
            <input type="checkbox" checked={filters.showHidden} onChange={(e) => set({ showHidden: e.target.checked })} />
            Show hidden
          </label>
        </div>
      )}

      <div className="listbar">
        <span>
          <b>{list.length}</b> {list.length === 1 ? "job" : "jobs"}
          {!savedOnly && JSON.stringify(f) !== JSON.stringify(DEFAULTS) && (
            <button className="link" onClick={() => setF(DEFAULTS)}>Reset filters</button>
          )}
        </span>
        {list.length > 0 && <button className="btn small" onClick={exportCsv}>Export CSV</button>}
      </div>

      {list.length === 0 ? (
        <div className="empty">
          {savedOnly
            ? "No saved jobs yet. Use ☆ on a job to save it here."
            : "No jobs match these filters. Try “+ Related HSE” or widen the date range."}
        </div>
      ) : (
        <ul className="jobs">
          {list.slice(0, limit).map((j) => {
            const c = data.byId.get(j.companyId);
            return (
              <li key={j.id} className={`job ${hidden.has(j.id) ? "dim" : ""}`}>
                <div className="main">
                  <a className="title" href={j.url} target="_blank" rel="noreferrer">{j.title}</a>
                  {isNew(j) && <span className="badge new">New</span>}
                  {j.tier === "related" && <span className="badge rel">Related</span>}
                  <div className="meta">
                    <span className="co">{c?.name ?? j.companyId}</span>
                    <span>{c?.category}</span>
                    <span>{flag(j.country)} {j.location || COUNTRY_NAME[j.country ?? ""] || "Location not listed"}</span>
                    <span title={j.postedAt ? `Posted ${j.postedAt}` : `First seen ${j.firstSeenAt}`}>
                      {j.postedAt ? `Posted ${ago(j.postedAt)}` : `Seen ${ago(j.firstSeenAt)}`}
                    </span>
                  </div>
                </div>
                <div className="row-actions">
                  <button
                    className={`icon ${saved.has(j.id) ? "on" : ""}`}
                    onClick={() => toggleSaved(j.id)}
                    aria-label={saved.has(j.id) ? "Unsave" : "Save"}
                    title={saved.has(j.id) ? "Unsave" : "Save"}
                  >
                    {saved.has(j.id) ? "★" : "☆"}
                  </button>
                  {!savedOnly && (
                    <button
                      className="icon"
                      onClick={() => toggleHidden(j.id)}
                      aria-label={hidden.has(j.id) ? "Unhide" : "Hide"}
                      title={hidden.has(j.id) ? "Unhide" : "Not interested"}
                    >
                      {hidden.has(j.id) ? "↺" : "✕"}
                    </button>
                  )}
                  <a className="btn small" href={j.url} target="_blank" rel="noreferrer">Apply ↗</a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > limit && (
        <button className="btn more" onClick={() => setLimit(limit + PAGE)}>
          Show more ({list.length - limit} left)
        </button>
      )}

      {!savedOnly && (
        <aside className="boards">
          <span>Also search job boards:</span>
          {BOARDS.map(([name, url]) => (
            <a key={name} href={url(filters.q || "technical safety engineer")} target="_blank" rel="noreferrer">
              {name} ↗
            </a>
          ))}
        </aside>
      )}
    </>
  );
}
