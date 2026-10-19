// Types shared by the fetcher (writes the data) and the web app (reads it).
// See data/SCHEMA.md for how each ATS config maps to real endpoints.

export type Category =
  | "NOC" | "IOC" | "Independent E&P" | "Oilfield Services" | "EPC / Engineering"
  | "Drilling" | "Offshore / Marine" | "LNG / Midstream" | "Refining / Petrochemicals"
  | "Safety / Risk Consultancy" | "Inspection / Certification";

export type Region =
  | "GCC" | "Middle East & North Africa" | "Europe" | "North America"
  | "Latin America" | "Sub-Saharan Africa" | "India" | "Asia-Pacific";

export type Ats =
  | { type: "workday"; host: string; tenant: string; site: string }
  | { type: "oracle"; host: string; siteNumber: string }
  | { type: "successfactors"; baseUrl: string }
  | { type: "smartrecruiters"; companyId: string }
  | { type: "greenhouse"; board: string }
  | { type: "lever"; company: string }
  | { type: "eightfold"; host: string; domain: string }
  | { type: "icims"; host: string }
  | { type: "jibe"; host: string }
  | { type: "ultipro"; host: string; tenant: string; boardId: string }
  | { type: "breezy"; hosts: string[] }
  | { type: "workable"; account: string }
  | { type: "hrmanager"; customer: string }
  | { type: "taleo"; host: string; section: string; portal?: string }
  | { type: "avature"; host: string; path: string }
  | { type: "phenom"; searchUrl?: string; host?: string; localePath?: string; companyName?: string }
  | { type: "successfactors-classic"; host: string; company: string }
  | { type: "html"; url: string; linkPattern?: string }
  | { type: "link-only"; reason: string };

export type AtsType = Ats["type"];

export interface Company {
  id: string;
  name: string;
  category: Category;
  region: Region;
  hq: string;
  careersUrl: string;
  ats: Ats;
  verified?: string;
  notes?: string;
}

export interface Job {
  id: string;            // `${companyId}:${source id}`
  companyId: string;
  title: string;
  location: string;
  country?: string;      // ISO-2, best effort
  postedAt?: string;     // ISO date (YYYY-MM-DD), best effort
  url: string;
  firstSeenAt: string;   // ISO timestamp of the first run that saw this job
  lastSeenAt: string;
  score: number;         // safety relevance, see data/keywords.json
  tier: "core" | "related";
  matched: string[];
}

export interface JobsFile {
  generatedAt: string;
  jobs: Job[];
}

export type FetchState = "ok" | "error" | "link-only" | "skipped";

export interface CompanyStatus {
  state: FetchState;
  jobs: number;          // relevant jobs kept
  scanned: number;       // raw postings returned by the searches
  error?: string;
  ms?: number;
  lastOkAt?: string;
}

export interface DirectoryEntry extends Company {
  status: CompanyStatus;
}

export interface DirectoryFile {
  generatedAt: string;
  companies: DirectoryEntry[];
}
