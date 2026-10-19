import type { Ats, Company } from "../../../shared/types";

export interface RawJob {
  sourceId: string;
  title: string;
  location?: string;
  url: string;
  posted?: unknown;
}

export interface AdapterCtx {
  company: Company;
  terms: string[];
  /** Upper bound on postings read per search term (keeps big employers bounded). */
  maxPerTerm: number;
}

export type Adapter<T extends Ats["type"]> = (
  ats: Extract<Ats, { type: T }>,
  ctx: AdapterCtx,
) => Promise<RawJob[]>;
