import type { Company } from "../../shared/types";

const CATEGORIES = [
  "NOC", "IOC", "Independent E&P", "Oilfield Services", "EPC / Engineering", "Drilling",
  "Offshore / Marine", "LNG / Midstream", "Refining / Petrochemicals",
  "Safety / Risk Consultancy", "Inspection / Certification",
];
const REGIONS = [
  "GCC", "Middle East & North Africa", "Europe", "North America", "Latin America",
  "Sub-Saharan Africa", "India", "Asia-Pacific",
];
const REQUIRED: Record<string, string[]> = {
  workday: ["host", "tenant", "site"],
  oracle: ["host", "siteNumber"],
  successfactors: ["baseUrl"],
  smartrecruiters: ["companyId"],
  greenhouse: ["board"],
  lever: ["company"],
  eightfold: ["host", "domain"],
  icims: ["host"],
  jibe: ["host"],
  ultipro: ["host", "tenant", "boardId"],
  breezy: ["hosts"],
  workable: ["account"],
  hrmanager: ["customer"],
  taleo: ["host", "section"],
  avature: ["host", "path"],
  phenom: [],
  "successfactors-classic": ["host", "company"],
  html: ["url"],
  "link-only": [],
};

export function validateCompany(c: Company): string[] {
  const e: string[] = [];
  if (!c.id || !/^[a-z0-9-]+$/.test(c.id)) e.push("id must be kebab-case");
  if (!c.name) e.push("missing name");
  if (!CATEGORIES.includes(c.category)) e.push(`bad category "${c.category}"`);
  if (!REGIONS.includes(c.region)) e.push(`bad region "${c.region}"`);
  if (!/^[A-Z]{2}$/.test(c.hq ?? "")) e.push(`bad hq "${c.hq}"`);
  try { new URL(c.careersUrl); } catch { e.push("bad careersUrl"); }
  const req = REQUIRED[c.ats?.type];
  if (!req) e.push(`unknown ats.type "${c.ats?.type}"`);
  else for (const k of req) if (!(c.ats as any)[k]) e.push(`ats.${k} missing`);
  if (c.ats?.type === "phenom" && !c.ats.searchUrl && !c.ats.host) e.push("phenom needs searchUrl or host");
  return e;
}
