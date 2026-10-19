// Merges data/research/*.json into data/companies.json: validates, dedupes, sorts.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Company } from "../../shared/types";
import { validateCompany } from "./validate";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = join(root, "data/research");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// data/overrides.json: { "<id>": { ...fields to replace } }, applied to researched entries
// before validation (hand fixes win).
const overrides: Record<string, Partial<Company>> = JSON.parse(
  await readFile(join(root, "data/overrides.json"), "utf8").catch(() => "{}"),
);
const used = new Set<string>();

const byId = new Map<string, Company>();
const byName = new Map<string, string>();
let problems = 0;
for (const f of (await readdir(dir)).filter((f) => f.endsWith(".json")).sort()) {
  const list: Company[] = JSON.parse(await readFile(join(dir, f), "utf8"));
  for (const raw of list) {
    const c: Company = overrides[raw.id] ? { ...raw, ...overrides[raw.id] } : raw;
    if (overrides[raw.id]) used.add(raw.id);
    const errs = validateCompany(c);
    if (errs.length) {
      problems++;
      console.warn(`${f}: ${c.id ?? c.name}: ${errs.join("; ")}`);
      continue;
    }
    const dupe = byId.get(c.id) ?? byId.get(byName.get(norm(c.name)) ?? "");
    // Prefer the entry with a working (non link-only, verified) config.
    const rank = (x: Company) => (x.ats.type !== "link-only" ? 2 : 0) + (x.verified ? 1 : 0);
    if (dupe && rank(dupe) >= rank(c)) continue;
    if (dupe) byId.delete(dupe.id);
    byId.set(c.id, c);
    byName.set(norm(c.name), c.id);
  }
}
for (const id of Object.keys(overrides)) if (!id.startsWith("$") && !used.has(id)) console.warn(`override for unknown company "${id}"`);
const companies = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
await writeFile(join(root, "data/companies.json"), JSON.stringify(companies, null, 2) + "\n");
const counts: Record<string, number> = {};
for (const c of companies) counts[c.ats.type] = (counts[c.ats.type] ?? 0) + 1;
console.log(`${companies.length} companies (${problems} invalid skipped)`, counts);
