// ATSs without a public JSON API: we read their server-rendered search pages.
// All of these honour robots.txt.
import * as cheerio from "cheerio";
import { getJson, getText, HttpError } from "../http";
import type { Adapter, AdapterCtx, RawJob } from "./types";

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
/** Tile layouts prefix values with their label ("Location MX", "Posting Date 13 Oct 2026"). */
const unlabel = (s: string) => s.replace(/^(Location|Country|City|Posting Date|Posted On|Date)\s*:?\s*/i, "");
const abs = (href: string, base: string) => new URL(href, base).toString();

/**
 * SAP SuccessFactors Career Site Builder. Classic ("RMK") sites render rows server-side;
 * newer "Unify" sites render in JS from POST /services/recruiting/v1/jobs, which we call directly.
 */
export const successfactors: Adapter<"successfactors"> = async ({ baseUrl }, ctx) => {
  const base = baseUrl.replace(/\/$/, "");
  const classic = await successfactorsClassic(base, ctx);
  if (classic.length) return classic;
  // No classic rows: try Unify. A 4xx there just means "classic site, nothing matched".
  return successfactorsUnify(base, ctx).catch((e) => {
    if (e instanceof HttpError && e.status < 500) return [];
    throw e;
  });
};

async function successfactorsUnify(base: string, ctx: AdapterCtx): Promise<RawJob[]> {
  // Some sites only answer for their own default locale (e.g. en_GB).
  for (const locale of ["en_US", "en_GB"]) {
    const out = await successfactorsUnifyLocale(base, locale, ctx);
    if (out.length) return out;
  }
  return [];
}

async function successfactorsUnifyLocale(base: string, locale: string, { terms, maxPerTerm }: AdapterCtx) {
  const out: RawJob[] = [];
  for (const keywords of terms) {
    for (let pageNumber = 0; pageNumber * 10 < maxPerTerm; pageNumber++) {
      const r = await getJson<any>(`${base}/services/recruiting/v1/jobs`, {
        json: {
          locale, pageNumber, sortBy: "", keywords, location: "", facetFilters: {},
          brand: "", skills: [], categoryId: 0, alertId: "", rcmCandidateId: "",
        },
      });
      const list = r.jobSearchResult ?? [];
      for (const { response: j } of list) {
        out.push({
          sourceId: String(j.id),
          title: j.unifiedStandardTitle ?? j.title,
          location: [j.jobLocationShort ?? j.jobLocationCountry ?? []].flat().join("; "),
          url: `${base}/job/${j.urlTitle ?? "job"}/${j.id}-${j.supportedLocales?.[0] ?? locale}/`,
          // en_GB sites send dd/mm/yyyy; normalise so the shared parser doesn't read it month-first.
          posted: locale === "en_GB"
            ? String(j.unifiedStandardStart ?? "").replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, "$3-$2-$1")
            : j.unifiedStandardStart,
        });
      }
      if (!list.length || (pageNumber + 1) * 10 >= (r.totalJobs ?? 0)) break;
    }
  }
  return out;
}

async function successfactorsClassic(base: string, { terms, maxPerTerm }: AdapterCtx): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    let startrow = 0;
    // "Tile" layouts render results from a separate fragment endpoint.
    let path = "search";
    while (startrow < maxPerTerm) {
      const url = `${base}/${path}/?q=${encodeURIComponent(term)}&startrow=${startrow}`;
      const $ = cheerio.load(await getText(url, { robots: true }));
      const rows = $("tr.data-row, li.job-tile, .job-tile");
      let added = 0;
      let fresh = 0;
      rows.each((_, el) => {
        const row = $(el);
        const a = row.find("a.jobTitle-link, a.jobTitle, a[href*='/job/']").first();
        const tileUrl = row.attr("data-url");
        const href = a.attr("href") ?? tileUrl;
        if (!href) return;
        const title = clean(a.text()) || clean(row.find("[class*='title'], h2, h3").first().text());
        const location = unlabel(
          clean(row.find(".jobLocation").first().text()) ||
            clean(row.find("[class*='location'], [class*='country']").first().text()),
        );
        const sourceId = href.match(/\/(\d+)\/?(?:\?|$)/)?.[1] ?? href;
        if (!seen.has(sourceId)) fresh++;
        seen.add(sourceId);
        out.push({
          sourceId,
          title,
          location,
          url: abs(href, base),
          posted: unlabel(clean(row.find(".jobDate, [class*='date']").first().text())),
        });
        added++;
      });
      // Some sites ignore startrow and return page 1 forever: stop when nothing new appears.
      if (!added && path === "search" && startrow === 0 && $("[class*='tile']").length) {
        path = "tile-search-results";
        continue;
      }
      if (!added || !fresh) break;
      startrow += added;
    }
    // A classic site with zero rows for the first term is likely a Unify site: let the caller switch.
    if (!out.length) return out;
  }
  return out;
}

/** iCIMS hosted career portals. */
export const icims: Adapter<"icims"> = async ({ host }, { terms }) => {
  const out: RawJob[] = [];
  for (const term of terms) {
    const url = `https://${host}/jobs/search?ss=1&searchKeyword=${encodeURIComponent(term)}&in_iframe=1`;
    const $ = cheerio.load(await getText(url, { robots: true }));
    $("a.iCIMS_Anchor[href*='/jobs/']").each((_, el) => {
      const a = $(el);
      const href = a.attr("href")!;
      const id = href.match(/\/jobs\/(\d+)\//)?.[1];
      if (!id) return;
      const row = a.closest(".row, li, tr");
      const title = clean(a.find("h3, h2").text()) || clean(a.attr("title")?.replace(/^\d+\s*-\s*/, "")) || clean(a.text());
      const locLabel = row.find("span:contains('Location'), dt:contains('Location')").first();
      const location = clean(locLabel.next().text()) || clean(row.find(".header.left span").last().text());
      out.push({ sourceId: id, title, location, url: abs(href.replace(/[?&]in_iframe=1/, ""), url) });
    });
  }
  return out;
};

/** Avature career portals (…/SearchJobs, job links contain /JobDetail/). */
export const avature: Adapter<"avature"> = async ({ host, path }, { terms }) => {
  const out: RawJob[] = [];
  for (const term of terms) {
    // Portals differ on the keyword param; listFilterMode=1 makes them apply it.
    const k = encodeURIComponent(term);
    const url = `https://${host}${path}/SearchJobs/?search=${k}&keywords=${k}&listFilterMode=1&jobRecordsPerPage=100`;
    const $ = cheerio.load(await getText(url, { robots: true }));
    $("a[href*='/JobDetail/']").each((_, el) => {
      const a = $(el);
      const href = a.attr("href")!;
      // Share buttons (twitter intent etc.) embed JobDetail URLs too; keep same-host links only.
      if (new URL(href, url).host !== host) return;
      const title = clean(a.text());
      if (!title || /apply|more info|view|share/i.test(title)) return;
      const card = a.closest(".article--result, article, li.job, .article");
      const field = (re: RegExp) =>
        card.find("li, span, div").filter((_, e) => re.test($(e).attr("class") ?? "")).first().text();
      out.push({
        sourceId: href.match(/\/(\d+)(?:[/?]|$)/)?.[1] ?? href,
        title,
        location: [field(/City|ocation/), field(/Country/)].map(clean).filter(Boolean).join(", "),
        url: abs(href, url),
        posted: clean(field(/Date/i)),
      });
    });
  }
  return out;
};

/** Oracle Taleo career sections, via the JSON endpoint the search page itself uses. */
export const taleo: Adapter<"taleo"> = async ({ host, section, portal: knownPortal }, { terms }) => {
  const portal =
    knownPortal ??
    (await getText(`https://${host}/careersection/${section}/jobsearch.ftl?lang=en`, { robots: true }))
      .match(/portal[=:"'\s]+(\d{6,})/)?.[1];
  if (!portal) throw new Error("taleo: could not find portal id on search page");
  const out: RawJob[] = [];
  for (const term of terms) {
    const r = await getJson<any>(
      `https://${host}/careersection/rest/jobboard/searchjobs?lang=en&portal=${portal}`,
      {
        headers: { tz: "GMT+00:00", tzname: "UTC" },
        json: {
          multilineEnabled: false,
          sortingSelection: { sortBySelectionParam: "3", ascendingSortingOrder: "false" },
          fieldData: { fields: { KEYWORD: term, LOCATION: "", ORGANIZATION: "" }, valid: true },
          filterSelectionParam: { searchFilterSelections: [] },
          advancedSearchFiltersSelectionParam: { searchFilterSelections: [] },
          pageNo: 1,
        },
      },
    );
    for (const j of r.requisitionList ?? []) {
      const [title, location, posted] = j.column ?? [];
      out.push({
        sourceId: String(j.contestNo ?? j.jobId),
        title: clean(title),
        location: clean(Array.isArray(location) ? location.join(", ") : String(location ?? "").replace(/[[\]"]/g, "")),
        url: `https://${host}/careersection/${section}/jobdetail.ftl?job=${j.contestNo ?? j.jobId}&lang=en`,
        posted,
      });
    }
  }
  return out;
};

/**
 * Generic: schema.org JobPosting JSON-LD on the page, otherwise anchors matching linkPattern.
 * `url` may contain {q}; without it the page is fetched once and filtered locally.
 */
export const html: Adapter<"html"> = async ({ url, linkPattern }, { terms }) => {
  const urls = url.includes("{q}") ? terms.map((t) => url.replace("{q}", encodeURIComponent(t))) : [url];
  const out: RawJob[] = [];
  const pattern = linkMatcher(linkPattern);
  for (const u of urls) {
    const $ = cheerio.load(await getText(u, { robots: true }));
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).text());
        const items = [data, ...(data["@graph"] ?? []), ...(Array.isArray(data) ? data : [])].flat();
        for (const it of items) {
          if (it?.["@type"] !== "JobPosting") continue;
          const addr = [it.jobLocation].flat()[0]?.address ?? {};
          out.push({
            sourceId: String(it.identifier?.value ?? it.url ?? it.title),
            title: clean(it.title),
            location: [addr.addressLocality, addr.addressRegion, addr.addressCountry?.name ?? addr.addressCountry]
              .filter(Boolean).join(", "),
            url: it.url ? abs(it.url, u) : u,
            posted: it.datePosted,
          });
        }
      } catch { /* malformed JSON-LD: ignore */ }
    });
    if (pattern) {
      $("a[href]").each((_, el) => {
        const a = $(el);
        const href = a.attr("href")!;
        if (!pattern(href)) return;
        const card = a.closest("li, tr, article, .card, .job, [class*='job']");
        // Some lists wrap the whole card in an empty-text link; fall back to the card heading
        // or a title-ish query parameter (?position-name=...).
        const q = new URL(href, u).searchParams;
        const title =
          clean(a.text()) || clean(a.attr("title")) || clean(a.attr("aria-label")) ||
          clean(card.find("h1, h2, h3, h4, [class*='title']").first().text()) ||
          clean([...q.entries()].find(([k]) => /title|name|position/i.test(k))?.[1]);
        if (!title || title.length < 4 || /^(apply|read more|view|details|job details)$/i.test(title)) return;
        out.push({
          sourceId: abs(href, u),
          title,
          location: clean(card.find("[class*='location']").first().text()),
          url: abs(href, u),
          posted: clean(card.find("[class*='date'], time").first().text()),
        });
      });
    }
  }
  return out;
};

/** linkPattern is a plain substring ("/job/"), or a regex when written as "/.../". */
function linkMatcher(p?: string): ((href: string) => boolean) | null {
  if (!p) return null;
  const re = p.length > 2 && p.startsWith("/") && p.endsWith("/") && !p.slice(1, -1).startsWith("/")
    ? new RegExp(p.slice(1, -1), "i")
    : null;
  return re ? (h) => re.test(h) : (h) => h.toLowerCase().includes(p.toLowerCase());
}

/**
 * Phenom People career sites embed search results as JSON in `phApp.ddo = {...};`.
 * searchUrl is the site's search-results page, e.g. https://jobs.example.com/us/en/search-results
 */
export const phenom: Adapter<"phenom"> = async (ats, { terms, maxPerTerm }) => {
  const searchUrl = ats.searchUrl ?? `https://${ats.host}/${ats.localePath ?? "us/en"}/search-results`;
  const site = searchUrl.replace(/\/search-results.*$/, "");
  const want = ats.companyName?.toLowerCase();
  const out: RawJob[] = [];
  for (const term of terms) {
    for (let from = 0; from < maxPerTerm; from += 10) {
      const page = await getText(`${searchUrl}?keywords=${encodeURIComponent(term)}&from=${from}`, {
        robots: true,
        memo: true,
      });
      const block = extractJsonAfter(page, "phApp.ddo = ")?.eagerLoadRefineSearch;
      const jobs: any[] = block?.data?.jobs ?? [];
      for (const j of jobs) {
        if (want && String(j.companyName ?? "").toLowerCase() !== want) continue;
        out.push({
          sourceId: String(j.jobId ?? j.reqId),
          title: j.title,
          location: j.cityStateCountry ?? j.location ?? [j.city, j.country].filter(Boolean).join(", "),
          url: `${site}/job/${j.jobId}`,
          posted: j.postedDate ?? j.dateCreated,
        });
      }
      if (!jobs.length || from + 10 >= (block?.totalHits ?? 0)) break;
    }
  }
  return out;
};

/** Legacy SuccessFactors career portal: one XML feed with every open requisition. */
export const successfactorsClassicFeed: Adapter<"successfactors-classic"> = async ({ host, company }) => {
  const base = `https://${host}/career?company=${encodeURIComponent(company)}`;
  const $ = cheerio.load(await getText(`${base}&career_ns=job_listing_summary&resultType=XML`), { xml: true });
  return $("Job")
    .map((_, el) => {
      const j = $(el);
      const id = clean(j.find("ReqId").text());
      return {
        sourceId: id,
        title: clean(j.find("JobTitle").text()),
        location: clean(j.find("Location, location, City").first().text()),
        url: `${base}&career_ns=job_listing&career_job_req_id=${id}`,
        posted: clean(j.find("Posted-Date, PostedDate").first().text()),
      };
    })
    .get();
};

/** Reads one balanced JSON object that follows `marker` in a page's inline script. */
export function extractJsonAfter(src: string, marker: string): any {
  const start = src.indexOf(marker);
  if (start < 0) return null;
  let i = src.indexOf("{", start);
  if (i < 0) return null;
  const begin = i;
  let depth = 0;
  let inStr = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(src.slice(begin, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** iCIMS "Jibe" career front-ends: GET https://{host}/api/jobs?keywords=..&page=N */
export const jibe: Adapter<"jibe"> = async ({ host }, { terms, maxPerTerm }) => {
  const out: RawJob[] = [];
  for (const term of terms) {
    for (let page = 1; (page - 1) * 10 < maxPerTerm; page++) {
      const r = await getJson<any>(`https://${host}/api/jobs?keywords=${encodeURIComponent(term)}&page=${page}`, {
        robots: true,
      });
      const jobs: any[] = r.jobs ?? [];
      for (const { data: j } of jobs) {
        out.push({
          sourceId: String(j.req_id ?? j.slug),
          title: j.title,
          location: j.full_location ?? [j.city, j.country].filter(Boolean).join(", "),
          url: `https://${host}/jobs/${j.slug ?? j.req_id}`,
          posted: j.posted_date ?? j.create_date,
        });
      }
      if (!jobs.length || out.length >= (r.totalCount ?? 0)) break;
    }
  }
  return out;
};
