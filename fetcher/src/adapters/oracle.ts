import { getJson } from "../http";
import type { Adapter, RawJob } from "./types";

interface OrcResponse {
  items: {
    TotalJobsCount?: number;
    requisitionList: { Id: string; Title: string; PrimaryLocation?: string; PostedDate?: string }[];
  }[];
}

export const oracle: Adapter<"oracle"> = async ({ host, siteNumber }, { terms, maxPerTerm }) => {
  const out: RawJob[] = [];
  for (const term of terms) {
    for (let offset = 0; offset < maxPerTerm; offset += 25) {
      const finder =
        `findReqs;siteNumber=${siteNumber},facetsList=LOCATIONS,keyword="${term}",limit=25,offset=${offset},sortBy=POSTING_DATES_DESC`;
      const url =
        `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
        `?onlyData=true&expand=requisitionList.secondaryLocations&finder=${encodeURIComponent(finder)}`;
      const r = await getJson<OrcResponse>(url);
      const block = r.items?.[0];
      const list = block?.requisitionList ?? [];
      for (const j of list) {
        out.push({
          sourceId: String(j.Id),
          title: j.Title.replace(/^\d{6,}_/, ""), // some tenants prefix the requisition number
          location: j.PrimaryLocation,
          url: `https://${host}/hcmUI/CandidateExperience/en/sites/${siteNumber}/job/${j.Id}`,
          posted: j.PostedDate,
        });
      }
      if (!list.length || offset + 25 >= (block?.TotalJobsCount ?? 0)) break;
    }
  }
  return out;
};
