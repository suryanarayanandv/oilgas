import { getJson } from "../http";
import type { Adapter, RawJob } from "./types";

interface WdResponse {
  total: number;
  jobPostings: { title: string; externalPath: string; locationsText?: string; postedOn?: string; bulletFields?: string[] }[];
}

export const workday: Adapter<"workday"> = async ({ host, tenant, site }, { terms, maxPerTerm }) => {
  const api = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
  // Shared "myworkdaysite.com" hosts put the tenant in the public job URL path.
  const jobBase = host.endsWith("myworkdaysite.com")
    ? `https://${host}/en-US/recruiting/${tenant}/${site}`
    : `https://${host}/en-US/${site}`;
  const out: RawJob[] = [];
  for (const searchText of terms) {
    for (let offset = 0; offset < maxPerTerm; offset += 20) {
      const r = await getJson<WdResponse>(api, {
        json: { appliedFacets: {}, limit: 20, offset, searchText },
      });
      for (const p of r.jobPostings ?? []) {
        out.push({
          sourceId: p.bulletFields?.[0] ?? p.externalPath,
          title: p.title,
          // "2 Locations" hides the list; the path's first segment is the primary location.
          location: /^\d+ Locations?$/.test(p.locationsText ?? "")
            ? p.externalPath.split("/")[2]?.replace(/-+/g, " ")
            : p.locationsText,
          url: `${jobBase}${p.externalPath}`,
          posted: p.postedOn,
        });
      }
      if (!r.jobPostings?.length || offset + 20 >= r.total) break;
    }
  }
  return out;
};
