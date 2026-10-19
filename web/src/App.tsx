import { useEffect, useMemo, useState } from "react";
import { ago, repoSlug, useData, useStored, useStoredSet, visitBaseline, WORKFLOW_FILE } from "./lib";
import { JobsView } from "./JobsView";
import { CompaniesView } from "./CompaniesView";
import { AddCompany } from "./AddCompany";

type Tab = "jobs" | "saved" | "companies" | "add";

export function App() {
  const { data, error, refreshing, refresh } = useData();
  const [tab, setTab] = useStored<Tab>("tab", "jobs");
  const [saved, toggleSaved] = useStoredSet("saved");
  const [hidden, toggleHidden] = useStoredSet("hidden");
  const [theme, setTheme] = useStored<"auto" | "light" | "dark">("theme", "auto");
  const [toast, setToast] = useState<string | null>(null);
  const baseline = useMemo(visitBaseline, []);
  const repo = repoSlug();

  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  const stats = useMemo(() => {
    if (!data) return null;
    const core = data.jobs.filter((j) => j.tier === "core").length;
    const ok = data.companies.filter((c) => c.status.state === "ok").length;
    return { core, related: data.jobs.length - core, ok, total: data.companies.length };
  }, [data]);

  async function onRefresh() {
    const r = await refresh();
    if (!r) setToast("Couldn't reload the data. Check your connection.");
    else if (!r.changed) setToast("Already showing the latest snapshot. Use “Fetch now” to scan the career sites again.");
    else setToast(`Loaded the latest snapshot — ${r.added} new job${r.added === 1 ? "" : "s"}.`);
    setTimeout(() => setToast(null), 6000);
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 2 4 7v8c0 7.5 5.1 13.4 12 15 6.9-1.6 12-7.5 12-15V7z" fill="var(--accent)" />
            <path d="M16 9c-2.5 3.5-4.5 6-4.5 8.6a4.5 4.5 0 0 0 9 0C20.5 15 18.5 12.5 16 9z" fill="#fff" />
          </svg>
          <div>
            <h1>Safety Jobs Radar</h1>
            <p className="sub">Technical &amp; process safety roles across oil &amp; gas career sites</p>
          </div>
        </div>
        <div className="actions">
          <span className="updated" title={data?.generatedAt}>
            {data ? <>Updated {ago(data.generatedAt)}</> : "Loading…"}
          </span>
          <button className="btn primary" onClick={onRefresh} disabled={refreshing || !data}>
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
          {repo && (
            <a
              className="btn"
              href={`https://github.com/${repo}/actions/workflows/${WORKFLOW_FILE}`}
              target="_blank"
              rel="noreferrer"
              title="Opens GitHub Actions. Click “Run workflow” to scan every career site now (about 10–20 min)."
            >
              Fetch now ↗
            </a>
          )}
          <select
            className="theme"
            aria-label="Theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as typeof theme)}
          >
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </header>

      {stats && (
        <section className="stats" aria-label="Summary">
          <div><b>{stats.core}</b><span>core safety roles</span></div>
          <div><b>{stats.related}</b><span>related HSE roles</span></div>
          <div><b>{stats.ok}</b><span>companies scanned</span></div>
          <div><b>{stats.total}</b><span>companies listed</span></div>
        </section>
      )}

      <nav className="tabs" role="tablist">
        {(
          [
            ["jobs", "Jobs"],
            ["saved", `Saved${saved.size ? ` (${saved.size})` : ""}`],
            ["companies", "Companies"],
            ["add", "Add company"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>

      <main>
        {error && !data && <div className="empty">Couldn't load job data: {error}</div>}
        {!data && !error && <div className="empty">Loading jobs…</div>}
        {data && (tab === "jobs" || tab === "saved") && (
          <JobsView
            data={data}
            savedOnly={tab === "saved"}
            saved={saved}
            hidden={hidden}
            toggleSaved={toggleSaved}
            toggleHidden={toggleHidden}
            baseline={baseline}
          />
        )}
        {data && tab === "companies" && <CompaniesView data={data} />}
        {tab === "add" && <AddCompany repo={repo} />}
      </main>

      <footer>
        Listings are read from each company's public career site and link back to it for applying.
        Some sites can't be read automatically. They are still listed under Companies with a direct link.
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
