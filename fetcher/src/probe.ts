// Debug one company's adapter and print raw postings:  npm run probe -- <company-id> [term]
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Company } from "../../shared/types";
import { adapterFor } from "./adapters";
import { classify } from "./classify";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const [id, term = "safety"] = process.argv.slice(2);
const companies: Company[] = JSON.parse(await readFile(join(root, "data/companies.json"), "utf8"));
const c = companies.find((x) => x.id === id);
if (!c) throw new Error(`no company "${id}"`);
const raw = await adapterFor(c.ats)!(c.ats, { company: c, terms: [term], maxPerTerm: 40 });
console.log(`${raw.length} postings for "${term}" (${c.ats.type})`);
for (const r of raw.slice(0, 25)) console.log(`${classify(r.title).tier ?? "-"}\t${r.title}\t${r.location ?? ""}\t${String(r.posted ?? "")}\t${r.url}`);
