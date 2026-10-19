// Orchestrator: runs every company's adapter, classifies titles, merges with the previous
// snapshot (to keep firstSeenAt), and writes web/public/data/{jobs,directory}.json.
//
//   npm run fetch                       all companies
//   npm run fetch -- --only shell,adnoc only these ids
//   npm run fetch -- --ats workday      only one ATS type
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Company, CompanyStatus, DirectoryFile, Job, JobsFile } from "../../shared/types";
import { detectCountry } from "../../shared/geo";
import { adapterFor } from "./adapters";
import { classify, searchTerms } from "./classify";
import { parsePosted } from "./dates";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "web/public/data");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);
const COMPANY_TIMEOUT_MS = 4 * 60_000;
const MAX_PER_TERM = Number(process.env.MAX_PER_TERM ?? 100);
/** Keep an errored company's previous jobs for this long so one bad run doesn't wipe them. */
const STALE_KEEP_DAYS = 7;

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    p,
    new Promise<T>((_, rej) => {
      timer = setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Some feeds double-encode entities ("Lab Quality &amp; Safety"). */
function decode(s: string) {
  return s
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
      e[0] === "#"
        ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
        : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/\s+/g, " ")
    .trim();
}

function describe(e: unknown): string {
  const err = e as Error & { cause?: { message?: string; code?: string } };
  const cause = err?.cause?.message ?? err?.cause?.code;
  return `${err?.message ?? String(e)}${cause ? `: ${cause}` : ""}`;
}

async function runCompany(c: Company, now: Date, prevById: Map<string, Job>) {
  const adapter = adapterFor(c.ats);
  if (!adapter) return { status: { state: "link-only", jobs: 0, scanned: 0 } as CompanyStatus, jobs: [] };
  const t0 = Date.now();
  const raw = await withTimeout(adapter(c.ats, { company: c, terms: searchTerms, maxPerTerm: MAX_PER_TERM }), COMPANY_TIMEOUT_MS);
  const seen = new Map<string, Job>();
  const nowIso = now.toISOString();
  for (const r of raw) {
    if (!r.title) continue;
    r.title = decode(r.title);
    r.location = r.location && decode(r.location);
    const id = `${c.id}:${r.sourceId}`;
    if (seen.has(id)) continue;
    const cls = classify(r.title);
    if (!cls.tier) continue;
    seen.set(id, {
      id,
      companyId: c.id,
      title: r.title,
      location: r.location || "",
      country:
        detectCountry(r.location) ??
        detectCountry(r.title) ??
        // Gulf companies and NOCs hire almost entirely at home; feeds without locations get the HQ.
        (!r.location && (c.region === "GCC" || c.category === "NOC") ? c.hq : undefined),
      postedAt: parsePosted(r.posted, now),
      url: r.url,
      firstSeenAt: prevById.get(id)?.firstSeenAt ?? nowIso,
      lastSeenAt: nowIso,
      score: cls.score,
      tier: cls.tier,
      matched: cls.matched,
    });
  }
  const jobs = [...seen.values()];
  return {
    status: { state: "ok", jobs: jobs.length, scanned: raw.length, ms: Date.now() - t0, lastOkAt: nowIso } as CompanyStatus,
    jobs,
  };
}

async function main() {
  const now = new Date();
  const companies: Company[] = JSON.parse(await readFile(join(root, "data/companies.json"), "utf8"));
  const only = arg("only")?.split(",");
  const atsFilter = arg("ats");
  const partial = Boolean(only || atsFilter);
  const selected = companies.filter(
    (c) => (!only || only.includes(c.id)) && (!atsFilter || c.ats.type === atsFilter),
  );

  const prevJobs = await readJson<JobsFile>(join(outDir, "jobs.json"), { generatedAt: "", jobs: [] });
  const prevDir = await readJson<DirectoryFile>(join(outDir, "directory.json"), { generatedAt: "", companies: [] });
  const prevById = new Map(prevJobs.jobs.map((j) => [j.id, j]));
  const prevStatus = new Map(prevDir.companies.map((c) => [c.id, c.status]));

  const results = new Map<string, { status: CompanyStatus; jobs: Job[] }>();
  let done = 0;
  const queue = [...selected];
  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      let r: { status: CompanyStatus; jobs: Job[] };
      try {
        r = await runCompany(c, now, prevById);
      } catch (e) {
        const keepAfter = now.getTime() - STALE_KEEP_DAYS * 86_400_000;
        r = {
          status: {
            state: "error",
            jobs: 0,
            scanned: 0,
            error: describe(e).slice(0, 300),
            lastOkAt: prevStatus.get(c.id)?.lastOkAt,
          },
          jobs: prevJobs.jobs.filter((j) => j.companyId === c.id && Date.parse(j.lastSeenAt) > keepAfter),
        };
        r.status.jobs = r.jobs.length;
      }
      results.set(c.id, r);
      done++;
      const s = r.status;
      console.log(
        `[${done}/${selected.length}] ${c.id.padEnd(28)} ${s.state.padEnd(9)} ${String(s.jobs).padStart(4)} jobs` +
          (s.scanned ? ` (${s.scanned} scanned)` : "") + (s.error ? `  ${s.error}` : ""),
      );
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // In a partial run, companies we didn't touch keep their previous jobs and status.
  const jobs: Job[] = [];
  const directory: DirectoryFile = { generatedAt: now.toISOString(), companies: [] };
  for (const c of companies) {
    const r = results.get(c.id);
    if (r) {
      jobs.push(...r.jobs);
      directory.companies.push({ ...c, status: r.status });
    } else {
      if (partial) jobs.push(...prevJobs.jobs.filter((j) => j.companyId === c.id));
      directory.companies.push({
        ...c,
        status: prevStatus.get(c.id) ?? { state: c.ats.type === "link-only" ? "link-only" : "skipped", jobs: 0, scanned: 0 },
      });
    }
  }
  jobs.sort((a, b) => (b.postedAt ?? b.firstSeenAt).localeCompare(a.postedAt ?? a.firstSeenAt) || b.score - a.score);

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "jobs.json"), JSON.stringify({ generatedAt: now.toISOString(), jobs } satisfies JobsFile));
  await writeFile(join(outDir, "directory.json"), JSON.stringify(directory));

  const by = (s: string) => directory.companies.filter((c) => c.status.state === s).length;
  console.log(
    `\n${jobs.length} jobs (${jobs.filter((j) => j.tier === "core").length} core) from ` +
      `${by("ok")} ok / ${by("error")} error / ${by("link-only")} link-only companies`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
