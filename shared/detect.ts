// Guess an ATS config from a job-search URL alone (used by the fetcher CLI and the web "Add company" form).
export function detectFromUrl(url: string): Record<string, string> | null {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  let m: RegExpMatchArray | null;
  if (u.host.endsWith("myworkdaysite.com") && (m = u.pathname.match(/\/recruiting\/([^/]+)\/([^/]+)/)))
    return { type: "workday", host: u.host, tenant: m[1], site: m[2] };
  if (/myworkday(jobs|site)\.com$/.test(u.host)) {
    const tenant = u.host.split(".")[0];
    const site = parts.find((p) => !/^[a-z]{2}-[A-Z]{2}$/.test(p)) ?? "";
    return { type: "workday", host: u.host, tenant, site };
  }
  if ((m = u.pathname.match(/CandidateExperience\/[a-z-]+\/sites\/([^/]+)/i)))
    return { type: "oracle", host: u.host, siteNumber: m[1] };
  if (u.host.endsWith("smartrecruiters.com")) return { type: "smartrecruiters", companyId: parts[0] };
  if (u.host.endsWith("greenhouse.io")) return { type: "greenhouse", board: parts[0] };
  if (u.host.endsWith("lever.co")) return { type: "lever", company: parts[0] };
  if (u.host.endsWith("icims.com")) return { type: "icims", host: u.host };
  if (u.host.endsWith("taleo.net") && (m = u.pathname.match(/careersection\/([^/]+)/)))
    return { type: "taleo", host: u.host, section: m[1] };
  if (u.host.endsWith("eightfold.ai")) return { type: "eightfold", host: u.host, domain: u.searchParams.get("domain") ?? "" };
  return null;
}
