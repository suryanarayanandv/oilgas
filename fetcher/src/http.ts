// Polite HTTP: one request at a time per host with a minimum gap, timeouts, retries,
// and a robots.txt check for page-scraping adapters.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/130.0 Safari/537.36 OilGasSafetyJobs/1.0 (personal job-search aggregator)";

const MIN_GAP_MS = Number(process.env.MIN_GAP_MS ?? 800);
const TIMEOUT_MS = 40_000; // some Oracle tenants take 10–20 s

const hostQueues = new Map<string, Promise<unknown>>();

function throttled<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const prev = hostQueues.get(host) ?? Promise.resolve();
  const next = prev.then(
    () => fn().finally(() => new Promise((r) => setTimeout(r, MIN_GAP_MS))),
    () => fn().finally(() => new Promise((r) => setTimeout(r, MIN_GAP_MS))),
  );
  hostQueues.set(host, next.catch(() => {}));
  return next;
}

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

export interface RequestOpts {
  method?: "GET" | "POST";
  json?: unknown;
  headers?: Record<string, string>;
  /** Check robots.txt first (for HTML scraping, not documented public APIs). */
  robots?: boolean;
  retries?: number;
}

async function raw(url: string, opts: RequestOpts): Promise<Response> {
  const u = new URL(url);
  if (opts.robots && !(await robotsAllowed(u))) {
    throw new Error(`robots.txt disallows ${u.pathname}`);
  }
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await throttled(u.host, () =>
        fetch(url, {
          method: opts.method ?? (opts.json ? "POST" : "GET"),
          headers: {
            "User-Agent": UA,
            "Accept-Language": "en-US,en;q=0.9",
            Accept: opts.json ? "application/json" : "text/html,application/json;q=0.9,*/*;q=0.8",
            ...(opts.json ? { "Content-Type": "application/json" } : {}),
            ...opts.headers,
          },
          body: opts.json ? JSON.stringify(opts.json) : undefined,
          redirect: "follow",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }),
      );
      if (res.ok) return res;
      // 4xx other than 429 won't get better by retrying.
      if (res.status !== 429 && res.status < 500) throw new HttpError(res.status, url);
      lastErr = new HttpError(res.status, url);
    } catch (e) {
      if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e;
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw lastErr;
}

export async function getJson<T = any>(url: string, opts: RequestOpts = {}): Promise<T> {
  const res = await raw(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } });
  return (await res.json()) as T;
}

const memo = new Map<string, Promise<string>>();

/** `memo: true` reuses the response for identical URLs within this run. */
export async function getText(url: string, opts: RequestOpts & { memo?: boolean } = {}): Promise<string> {
  if (opts.memo) {
    if (!memo.has(url)) memo.set(url, getText(url, { ...opts, memo: false }));
    return memo.get(url)!;
  }
  const res = await raw(url, opts);
  return res.text();
}

// --- robots.txt (minimal: User-agent * groups, longest-match Allow/Disallow) ---

const robotsCache = new Map<string, Promise<{ allow: string[]; disallow: string[] }>>();

async function loadRobots(origin: string) {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { allow: [], disallow: [] };
    return parseRobots(await res.text());
  } catch {
    return { allow: [], disallow: [] };
  }
}

export function parseRobots(txt: string) {
  const allow: string[] = [];
  const disallow: string[] = [];
  let applies = false;
  let lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.replace(/#.*/, "").trim().match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!lastWasAgent) applies = false;
      if (val === "*") applies = true;
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!applies) continue;
    if (key === "allow" && val) allow.push(val);
    if (key === "disallow" && val) disallow.push(val);
  }
  return { allow, disallow };
}

function ruleMatches(rule: string, path: string) {
  const re = new RegExp(
    "^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"),
  );
  return re.test(path);
}

export function isAllowed(rules: { allow: string[]; disallow: string[] }, path: string) {
  const best = (list: string[]) =>
    list.filter((r) => ruleMatches(r, path)).reduce((n, r) => Math.max(n, r.length), -1);
  return best(rules.allow) >= best(rules.disallow);
}

async function robotsAllowed(u: URL) {
  if (!robotsCache.has(u.origin)) robotsCache.set(u.origin, loadRobots(u.origin));
  return isAllowed(await robotsCache.get(u.origin)!, u.pathname + u.search);
}
