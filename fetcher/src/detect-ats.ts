// Guess the ATS config for a careers URL:  npm run detect -- https://careers.example.com
import { getText } from "./http";
import { detectFromUrl } from "../../shared/detect";

export function detectFromHtml(url: string, html: string): Record<string, string> | null {
  let m: RegExpMatchArray | null;
  if ((m = html.match(/https:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/)))
    return { type: "workday", host: `${m[1]}.${m[2]}.myworkdayjobs.com`, tenant: m[1], site: m[3] };
  if ((m = html.match(/https:\/\/([a-z0-9.-]+oraclecloud\.com)\/hcmUI\/CandidateExperience\/[a-z-]+\/sites\/([A-Za-z0-9_]+)/)))
    return { type: "oracle", host: m[1], siteNumber: m[2] };
  if (/jobTitle-link|class="data-row"|rmk-/.test(html)) return { type: "successfactors", baseUrl: new URL(url).origin };
  if ((m = html.match(/careers\.smartrecruiters\.com\/([A-Za-z0-9_-]+)|jobs\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/)))
    return { type: "smartrecruiters", companyId: m[1] ?? m[2] };
  if ((m = html.match(/boards\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i)))
    return { type: "greenhouse", board: m[1] };
  if ((m = html.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i))) return { type: "lever", company: m[1] };
  if ((m = html.match(/([a-z0-9-]+\.icims\.com)/i))) return { type: "icims", host: m[1] };
  if ((m = html.match(/([a-z0-9-]+\.taleo\.net)\/careersection\/([^/"']+)/i)))
    return { type: "taleo", host: m[1], section: m[2] };
  if (/\/api\/apply\/v2\/jobs|eightfold/i.test(html)) return { type: "eightfold", host: new URL(url).host, domain: "?" };
  if (/avature/i.test(html) || /\/SearchJobs/.test(html)) return { type: "avature", host: new URL(url).host, path: "?" };
  if (/"@type"\s*:\s*"JobPosting"/.test(html)) return { type: "html", url };
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  if (!url) {
    console.error("usage: npm run detect -- <careers url>");
    process.exit(1);
  }
  const fromUrl = detectFromUrl(url);
  if (fromUrl) console.log(JSON.stringify(fromUrl, null, 2));
  else {
    const html = await getText(url);
    console.log(JSON.stringify(detectFromHtml(url, html) ?? { type: "link-only", reason: "no known ATS markers found" }, null, 2));
  }
}
