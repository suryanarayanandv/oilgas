# companies.json schema

`data/companies.json` is an array of `Company` objects. The fetcher picks an adapter by `ats.type`.

```ts
type Company = {
  id: string;            // kebab-case, unique, e.g. "adnoc-offshore", "shell"
  name: string;          // display name, e.g. "ADNOC Offshore"
  category:
    | "NOC" | "IOC" | "Independent E&P" | "Oilfield Services" | "EPC / Engineering"
    | "Drilling" | "Offshore / Marine" | "LNG / Midstream" | "Refining / Petrochemicals"
    | "Safety / Risk Consultancy" | "Inspection / Certification";
  region: "GCC" | "Middle East & North Africa" | "Europe" | "North America"
        | "Latin America" | "Sub-Saharan Africa" | "India" | "Asia-Pacific";
  hq: string;            // ISO-3166 alpha-2 country of HQ, e.g. "AE"
  careersUrl: string;    // the human-facing careers / job search page
  ats: Ats;
  verified: string;      // YYYY-MM-DD when the ats config was last confirmed working
  notes?: string;        // anything useful, e.g. "blocks non-browser requests"
};

type Ats =
  // POST https://{host}/wday/cxs/{tenant}/{site}/jobs
  //   body {"appliedFacets":{},"limit":20,"offset":0,"searchText":"safety"}
  //   -> {total, jobPostings:[{title, externalPath, locationsText, postedOn}]}
  //   Job URL = https://{host}/en-US/{site}{externalPath}   (careers URL looks like https://{host}/{site} or /en-US/{site})
  | { type: "workday"; host: string; tenant: string; site: string }

  // GET https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions
  //     ?onlyData=true&expand=requisitionList.secondaryLocations
  //     &finder=findReqs;siteNumber={siteNumber},keyword=safety,limit=25,offset=0
  //   -> items[0].requisitionList[{Id, Title, PrimaryLocation, PostedDate}]
  //   Careers URL looks like https://{host}/hcmUI/CandidateExperience/en/sites/{siteNumber}
  | { type: "oracle"; host: string; siteNumber: string }

  // SAP SuccessFactors "Career Site Builder" (RMK) sites, e.g. https://jobs.company.com
  //   GET {baseUrl}/search/?q=safety&startrow=0  -> HTML with <tr class="data-row"> / a.jobTitle-link
  //   Newer "Unify" sites (JS-rendered) are handled automatically via POST {baseUrl}/services/recruiting/v1/jobs
  | { type: "successfactors"; baseUrl: string }

  // GET https://api.smartrecruiters.com/v1/companies/{companyId}/postings?q=safety&limit=100
  | { type: "smartrecruiters"; companyId: string }

  // GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs
  | { type: "greenhouse"; board: string }

  // GET https://api.lever.co/v0/postings/{company}?mode=json
  | { type: "lever"; company: string }

  // GET https://{host}/api/apply/v2/jobs?domain={domain}&query=safety&start=0&num=10
  //   -> {count, positions:[{name, location, t_create, canonicalPositionUrl}]}
  | { type: "eightfold"; host: string; domain: string }

  // iCIMS: GET https://{host}/jobs/search?ss=1&searchKeyword=safety&in_iframe=1  (HTML)
  | { type: "icims"; host: string }

  // iCIMS "Jibe" front-ends (careers.example.com/jobs): GET https://{host}/api/jobs?keywords=safety&page=1
  //   -> {totalCount, jobs:[{data:{req_id, title, full_location, posted_date, slug}}]}
  | { type: "jibe"; host: string }

  // UKG/UltiPro: POST https://{host}/{tenant}/JobBoard/{boardId}/JobBoardView/LoadSearchResults
  | { type: "ultipro"; host: string; tenant: string; boardId: string }
  // Breezy HR: GET https://{host}/json for each portal host
  | { type: "breezy"; hosts: string[] }
  // Workable: GET https://apply.workable.com/api/v1/widget/accounts/{account}
  | { type: "workable"; account: string }
  // HR-Manager (Talentech): GET https://api.hr-manager.net/jobportal.svc/{customer}/positionlist/json/
  | { type: "hrmanager"; customer: string }

  // Taleo: careersection URL e.g. https://{host}/careersection/{section}/jobsearch.ftl
  //   portal = numeric id the search page posts to (found in its network calls); scraped from the page if omitted
  | { type: "taleo"; host: string; section: string; portal?: string }

  // Avature: e.g. https://{host}/careers/SearchJobs?keywords=safety  (HTML)
  | { type: "avature"; host: string; path: string }   // path like "/careers" or "/en_US/careers"

  // Phenom People sites: search results are inline JSON in `phApp.ddo = {...};`
  //   GET {searchUrl}?keywords=safety&from=0  -> ddo.eagerLoadRefineSearch.{totalHits, data.jobs[]}
  //   companyName keeps only jobs whose companyName matches (group portals shared by subsidiaries)
  | { type: "phenom"; searchUrl?: string; host?: string; localePath?: string; companyName?: string }
  //   e.g. {searchUrl:"https://jobs.bechtel.com/us/en/search-results"} or {host:"jobs.adnoc.ae", localePath:"us/en"}

  // Legacy SuccessFactors career portal XML feed (no keyword search; filtered locally)
  //   GET https://{host}/career?company={company}&career_ns=job_listing_summary&resultType=XML
  | { type: "successfactors-classic"; host: string; company: string }

  // Any page whose job listings or detail pages embed schema.org JobPosting JSON-LD,
  // or a plain HTML list where job links match a recognizable pattern.
  // linkPattern is a plain substring of job hrefs ("/job/"), or a regex written as "/.../".
  | { type: "html"; url: string; linkPattern?: string }   // url may contain {q} for the keyword

  // Could not automate (bot protection, login wall, JS-only with no API, PDF list, email only...)
  | { type: "link-only"; reason: string };
```

## How to detect the ATS

Open the careers page and follow "Search jobs" / "View vacancies". Look at the final URL and the network calls:

| URL contains | ATS |
|---|---|
| `myworkdayjobs.com` or `myworkdaysite.com` | workday |
| `oraclecloud.com/hcmUI/CandidateExperience` | oracle |
| `successfactors.com`, `career{N}.sapsf.com`, or a custom domain whose HTML has `rmk` / `jobTitle-link` / `data-row` | successfactors |
| `smartrecruiters.com` | smartrecruiters |
| `greenhouse.io` | greenhouse |
| `lever.co` | lever |
| `eightfold.ai` or `/careers?` page calling `/api/apply/v2/jobs` | eightfold |
| `icims.com` | icims |
| `taleo.net` | taleo |
| `avature.net` or HTML with `/SearchJobs` | avature |
| anything else | html or link-only |

Always confirm with a real request (e.g. `curl`) that the endpoint returns jobs before setting `verified`.
