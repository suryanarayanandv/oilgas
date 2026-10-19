// Smaller ATSs with public JSON endpoints, mostly used by service companies.
import { getJson } from "../http";
import type { Adapter, RawJob } from "./types";

/** UKG / UltiPro Recruiting job boards. */
export const ultipro: Adapter<"ultipro"> = async ({ host, tenant, boardId }, { terms, maxPerTerm }) => {
  const board = `https://${host}/${tenant}/JobBoard/${boardId}`;
  const out: RawJob[] = [];
  for (const term of terms) {
    for (let skip = 0; skip < maxPerTerm; skip += 50) {
      const r = await getJson<any>(`${board}/JobBoardView/LoadSearchResults`, {
        json: {
          opportunitySearch: {
            Top: 50, Skip: skip, QueryString: term,
            OrderBy: [{ Value: "postedDateDesc", PropertyName: "PostedDate", Ascending: false }],
            Filters: [],
          },
          matchCriteria: {
            PreferredJobs: [], Educations: [], LicenseAndCertifications: [], Skills: [],
            hasNoLicenses: false, SkippedSkills: [],
          },
        },
      });
      const list: any[] = r.opportunities ?? [];
      for (const o of list) {
        const loc = o.Locations?.[0]?.Address;
        out.push({
          sourceId: o.Id,
          title: o.Title,
          location: loc?.City || loc?.Country
            ? [loc.City, loc.State?.Code, loc.Country?.Code].filter(Boolean).join(", ")
            : (o.Locations ?? []).map((l: any) => l.LocalizedDescription).filter(Boolean).join("; "),
          url: `${board}/OpportunityDetail?opportunityId=${o.Id}`,
          posted: o.PostedDate,
        });
      }
      if (!list.length || skip + 50 >= (r.totalCount ?? 0)) break;
    }
  }
  return out;
};

/** Breezy HR portals ({portal}.breezy.hr or white-labelled hosts). Returns everything; filtered locally. */
export const breezy: Adapter<"breezy"> = async ({ hosts }) => {
  const out: RawJob[] = [];
  for (const host of hosts) {
    const list = await getJson<any[]>(`https://${host}/json`);
    for (const j of list) {
      out.push({
        sourceId: j.id ?? j.url,
        title: j.name,
        location: j.location?.name ?? [j.location?.city, j.location?.country?.name].filter(Boolean).join(", "),
        url: j.url,
        posted: j.published_date,
      });
    }
  }
  return out;
};

/** Workable accounts (apply.workable.com/{account}). */
export const workable: Adapter<"workable"> = async ({ account }) => {
  const r = await getJson<any>(`https://apply.workable.com/api/v1/widget/accounts/${account}`);
  return (r.jobs ?? []).map((j: any) => ({
    sourceId: j.shortcode,
    title: j.title,
    location: [j.city, j.state, j.country].filter(Boolean).join(", "),
    url: j.url ?? `https://apply.workable.com/${account}/j/${j.shortcode}/`,
    posted: j.published_on,
  }));
};

/** HR-Manager (Talentech) job portals. Dates come as "/Date(ms+zone)/". */
export const hrmanager: Adapter<"hrmanager"> = async ({ customer }) => {
  const r = await getJson<any>(`https://api.hr-manager.net/jobportal.svc/${customer}/positionlist/json/`);
  return (r.Items ?? []).map((j: any) => ({
    sourceId: String(j.Id ?? j.AdvertisementUrl),
    title: j.Name,
    location: j.WorkPlace ?? "",
    url: j.AdvertisementUrl,
    posted: Number(String(j.Created ?? "").match(/\d{10,}/)?.[0]) || undefined,
  }));
};
