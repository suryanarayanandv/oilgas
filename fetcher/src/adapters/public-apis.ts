// ATSs with documented, unauthenticated public job APIs.
import { getJson, HttpError } from "../http";
import type { Adapter, AdapterCtx, RawJob } from "./types";

export const smartrecruiters: Adapter<"smartrecruiters"> = async ({ companyId }, { terms, maxPerTerm }) => {
  const out: RawJob[] = [];
  for (const term of terms) {
    for (let offset = 0; offset < maxPerTerm; offset += 100) {
      const r = await getJson<any>(
        `https://api.smartrecruiters.com/v1/companies/${companyId}/postings?q=${encodeURIComponent(term)}&limit=100&offset=${offset}`,
      );
      for (const p of r.content ?? []) {
        out.push({
          sourceId: p.id,
          title: p.name,
          location: p.location?.fullLocation ?? [p.location?.city, p.location?.country?.toUpperCase()].filter(Boolean).join(", "),
          url: `https://jobs.smartrecruiters.com/${companyId}/${p.id}`,
          posted: p.releasedDate,
        });
      }
      if (!r.content?.length || offset + 100 >= r.totalFound) break;
    }
  }
  return out;
};

// Greenhouse and Lever return every open job in one call; filtering happens in classify().
export const greenhouse: Adapter<"greenhouse"> = async ({ board }) => {
  const r = await getJson<any>(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`);
  return (r.jobs ?? []).map((j: any) => ({
    sourceId: String(j.id),
    title: j.title,
    location: j.location?.name,
    url: j.absolute_url,
    posted: j.first_published ?? j.updated_at,
  }));
};

export const lever: Adapter<"lever"> = async ({ company }) => {
  const r = await getJson<any[]>(`https://api.lever.co/v0/postings/${company}?mode=json`);
  return r.map((j) => ({
    sourceId: j.id,
    title: j.text,
    location: j.categories?.location ?? j.categories?.allLocations?.join(", "),
    url: j.hostedUrl,
    posted: j.createdAt,
  }));
};

export const eightfold: Adapter<"eightfold"> = async (ats, ctx) => {
  try {
    return await eightfoldV2(ats, ctx);
  } catch (e) {
    // Newer "PCSX" tenants refuse the v2 API with 403 and expose /api/pcsx/search instead.
    if (e instanceof HttpError && e.status === 403) return eightfoldPcsx(ats, ctx);
    throw e;
  }
};

async function eightfoldPcsx({ host, domain }: { host: string; domain: string }, { terms, maxPerTerm }: AdapterCtx) {
  const out: RawJob[] = [];
  for (const term of terms) {
    for (let start = 0; start < maxPerTerm; start += 10) {
      const r = await getJson<any>(
        `https://${host}/api/pcsx/search?domain=${encodeURIComponent(domain)}&query=${encodeURIComponent(term)}&location=&start=${start}`,
      );
      const list: any[] = r.data?.positions ?? [];
      for (const p of list) {
        out.push({
          sourceId: String(p.id ?? p.positionUrl),
          title: p.name,
          location: [p.locations ?? p.location ?? []].flat().join("; "),
          url: new URL(p.positionUrl ?? `/careers/job/${p.id}`, `https://${host}`).toString(),
          posted: p.postedTs,
        });
      }
      if (!list.length || start + list.length >= (r.data?.count ?? 0)) break;
    }
  }
  return out;
}

async function eightfoldV2({ host, domain }: { host: string; domain: string }, { terms, maxPerTerm }: AdapterCtx) {
  const out: RawJob[] = [];
  for (const term of terms) {
    for (let start = 0; start < maxPerTerm; start += 10) {
      const r = await getJson<any>(
        `https://${host}/api/apply/v2/jobs?domain=${encodeURIComponent(domain)}&query=${encodeURIComponent(term)}&start=${start}&num=10`,
      );
      for (const p of r.positions ?? []) {
        out.push({
          sourceId: String(p.id),
          title: p.name,
          location: p.location ?? p.locations?.join(", "),
          url: p.canonicalPositionUrl ?? `https://${host}/careers/job/${p.id}?domain=${domain}`,
          posted: p.t_create,
        });
      }
      if (!r.positions?.length || start + 10 >= (r.count ?? 0)) break;
    }
  }
  return out;
}
