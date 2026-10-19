import { useMemo, useState } from "react";
import type { DirectoryEntry } from "../../shared/types";
import { COUNTRY_NAME } from "../../shared/geo";
import { ago, flag, type Data } from "./lib";

const STATE_LABEL: Record<DirectoryEntry["status"]["state"], string> = {
  ok: "Scanned",
  error: "Fetch failed",
  "link-only": "Link only",
  skipped: "Not yet scanned",
};

const ATS_LABEL: Record<string, string> = {
  workday: "Workday", oracle: "Oracle Cloud", successfactors: "SuccessFactors", smartrecruiters: "SmartRecruiters",
  greenhouse: "Greenhouse", lever: "Lever", eightfold: "Eightfold", icims: "iCIMS", taleo: "Taleo",
  avature: "Avature", phenom: "Phenom", "successfactors-classic": "SuccessFactors", jibe: "iCIMS", ultipro: "UKG", breezy: "Breezy", workable: "Workable", hrmanager: "HR-Manager", html: "Web page", "link-only": "—",
};

export function CompaniesView({ data }: { data: Data }) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState("");

  const coreByCompany = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of data.jobs) if (j.tier === "core") m.set(j.companyId, (m.get(j.companyId) ?? 0) + 1);
    return m;
  }, [data]);

  const regions = [...new Set(data.companies.map((c) => c.region))].sort();
  const categories = [...new Set(data.companies.map((c) => c.category))].sort();
  const needle = q.trim().toLowerCase();

  const list = data.companies
    .filter(
      (c) =>
        (!needle || `${c.name} ${COUNTRY_NAME[c.hq] ?? ""}`.toLowerCase().includes(needle)) &&
        (!region || c.region === region) &&
        (!category || c.category === category) &&
        (!state || c.status.state === state),
    )
    .sort((a, b) => (coreByCompany.get(b.id) ?? 0) - (coreByCompany.get(a.id) ?? 0) || a.name.localeCompare(b.name));

  const count = (s: string) => data.companies.filter((c) => c.status.state === s).length;

  return (
    <>
      <div className="filters">
        <input className="search" type="search" placeholder="Search companies…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search companies" />
        <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
          <option value="">All regions</option>
          {regions.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Company type">
          <option value="">All company types</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Scan status">
          <option value="">Any status</option>
          <option value="ok">Scanned ({count("ok")})</option>
          <option value="error">Fetch failed ({count("error")})</option>
          <option value="link-only">Link only ({count("link-only")})</option>
        </select>
      </div>
      <div className="listbar"><span><b>{list.length}</b> companies</span></div>

      <div className="table-wrap">
        <table className="companies">
          <thead>
            <tr>
              <th>Company</th>
              <th>Type</th>
              <th>Region</th>
              <th className="num">Core roles</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const s = c.status;
              const tip =
                s.state === "error"
                  ? `${s.error ?? ""}${s.lastOkAt ? ` · last OK ${ago(s.lastOkAt)}` : ""}`
                  : c.ats.type === "link-only"
                    ? c.ats.reason
                    : `${ATS_LABEL[c.ats.type]} · ${s.scanned} postings scanned`;
              return (
                <tr key={c.id}>
                  <td>
                    <div className="cname">{c.name}</div>
                    <div className="csub">{flag(c.hq)} {COUNTRY_NAME[c.hq] ?? c.hq} · {ATS_LABEL[c.ats.type]}</div>
                  </td>
                  <td>{c.category}</td>
                  <td>{c.region}</td>
                  <td className="num">{coreByCompany.get(c.id) ?? (s.state === "ok" ? 0 : "—")}</td>
                  <td><span className={`state ${s.state}`} title={tip}>{STATE_LABEL[s.state]}</span></td>
                  <td><a className="btn small" href={c.careersUrl} target="_blank" rel="noreferrer">Careers ↗</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
