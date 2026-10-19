import type { Ats } from "../../../shared/types";
import type { AdapterCtx, RawJob } from "./types";
import { workday } from "./workday";
import { oracle } from "./oracle";
import { smartrecruiters, greenhouse, lever, eightfold } from "./public-apis";
import { ultipro, breezy, workable, hrmanager } from "./more-apis";
import { successfactors, successfactorsClassicFeed, icims, avature, taleo, html, phenom, jibe } from "./html-sites";

const adapters: { [K in Ats["type"]]?: (ats: any, ctx: AdapterCtx) => Promise<RawJob[]> } = {
  workday, oracle, smartrecruiters, greenhouse, lever, eightfold, successfactors, icims, avature, taleo, html, phenom, jibe,
  ultipro, breezy, workable, hrmanager,
  "successfactors-classic": successfactorsClassicFeed,
};

export function adapterFor(ats: Ats) {
  return adapters[ats.type];
}

export type { RawJob, AdapterCtx };
