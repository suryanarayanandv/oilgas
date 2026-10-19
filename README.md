# Safety Jobs Radar

One place to see **Technical Safety / Process Safety / Loss Prevention / HSE** vacancies across oil & gas
company career sites (NOCs, majors, service companies, EPC contractors, consultancies) in the Gulf and worldwide.

- **Website**: a static site (GitHub Pages). It reads `web/public/data/jobs.json` and `directory.json`.
- **Fetcher**: a Node script that runs in GitHub Actions every 8 hours. It reads each company's career site
  through an adapter for its hiring platform and writes those JSON files.

Browsers block a page from reading other sites' job data (CORS), which is why fetching runs in Actions and not
in the browser. Nothing needs hosting or maintenance; GitHub runs both parts for free.

```
data/companies.json ──► fetcher (adapter per ATS) ──► web/public/data/*.json ──► static site
```

## Deploy (one time, ~5 minutes)

1. Create a GitHub repo and push this folder to `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Go to **Actions → "Fetch jobs and deploy" → Run workflow**. The first scan takes about 10–20 minutes.
4. The site is at `https://<user>.github.io/<repo>/`.

Updates after that:
- **Automatic**: the workflow runs every 8 hours and commits the new snapshot.
- **On demand**: the site's **Fetch now ↗** button opens the workflow page; click **Run workflow**.
  Then press **↻ Refresh** on the site to load the new snapshot.
- Pushing code redeploys the site without re-scanning. Put `[fetch]` in the commit message to also re-scan.

## Run locally

```bash
npm install
npm run build:companies     # merge data/research/*.json + data/overrides.json -> data/companies.json
npm run fetch               # scan everything (or: npm run fetch -- --only shell,adnoc-offshore)
npm run dev                 # http://localhost:5173
npm test                    # fetcher unit tests
```

## Adding or fixing a company

The company list is researched per region/segment in `data/research/*.json` (see `data/SCHEMA.md` for the format).
Hand corrections go in `data/overrides.json`, keyed by company id, and win over the researched values.

```bash
npm run detect -w fetcher -- https://careers.example.com     # guess the ATS + config from a URL
npm run probe  -w fetcher -- <company-id> [term]              # run one company's adapter, print raw postings
```

The site's **Add company** tab builds the JSON entry for you.

## Supported hiring platforms

| `ats.type` | Platform | Method |
|---|---|---|
| `workday` | Workday | public CXS JSON search |
| `oracle` | Oracle Recruiting Cloud | public REST finder |
| `successfactors` | SAP SuccessFactors Career Site Builder | search page HTML, or the "Unify" JSON API |
| `successfactors-classic` | legacy SuccessFactors portal | XML job feed |
| `phenom` | Phenom People | inline `phApp.ddo` JSON on the search page |
| `avature` | Avature | search page HTML |
| `eightfold` | Eightfold | v2 or PCSX JSON API |
| `smartrecruiters`, `greenhouse`, `lever` | public posting APIs | JSON |
| `icims`, `taleo` | iCIMS, Taleo | best effort |
| `html` | anything else | JSON-LD `JobPosting`, or job links matched by `linkPattern` |
| `link-only` | can't be automated | listed with a direct careers link |

## Relevance

`data/keywords.json` scores each job title. **Core** roles are technical/process safety, loss prevention,
F&G, functional safety/SIL, HAZOP/QRA and safety case, including French/Spanish/Portuguese/Norwegian/German terms.
**Related** roles are general HSE/HSSE, safety advisor, asset integrity and similar. Everything else is dropped.

## Being a good citizen

- Only public job listings are read, at most one request per ~0.8 s per host, a few times a day.
  `robots.txt` is honoured for page scraping.
- Every job links to the employer's own site to apply.
- LinkedIn, Indeed, Bayt, NaukriGulf and similar boards forbid scraping, so they're offered as one-click
  searches instead.
- Some employers' sites block automated requests from cloud servers. Those show as **Fetch failed** or
  **Link only** under Companies; the previous snapshot of an errored company's jobs is kept for 7 days.
