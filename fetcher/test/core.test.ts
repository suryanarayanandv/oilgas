import { describe, expect, it } from "vitest";
import { classify } from "../src/classify";
import { parsePosted } from "../src/dates";
import { detectCountry } from "../../shared/geo";
import { detectFromUrl } from "../../shared/detect";
import { isAllowed, parseRobots } from "../src/http";

describe("classify", () => {
  it.each([
    ["Senior Technical Safety Engineer", "core"],
    ["Process Safety Engineer - Onshore", "core"],
    ["Loss Prevention Specialist", "core"],
    ["Fire & Gas Engineer", "core"],
    ["Functional Safety (SIL) Lead", "core"],
    ["HAZOP Chairperson", "core"],
    ["HSE Engineer", "related"],
    ["Ingénieur Polyvalent Sécurité débutant H/F", "core"],
    ["Teknisk sikkerhet ingeniør", "core"],
    ["Ingeniero de Seguridad de Procesos", "core"],
    ["HSSE Advisor", "related"],
    ["Asset Integrity Manager", "related"],
  ])("%s -> %s", (title, tier) => {
    expect(classify(title).tier).toBe(tier);
  });
  it.each(["Mechanical Engineer", "Food Safety Auditor", "Patient Safety Nurse", "Silicon design engineer"])(
    "drops %s",
    (title) => expect(classify(title).tier).toBeNull(),
  );
});

describe("parsePosted", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  it.each([
    ["Posted Today", "2026-10-19"],
    ["Posted Yesterday", "2026-10-18"],
    ["Posted 5 Days Ago", "2026-10-14"],
    ["Posted 30+ Days Ago", "2026-09-19"],
    ["2026-10-01T08:00:00Z", "2026-10-01"],
    ["10/03/2026", "2026-10-03"],
    ["25.09.2026", "2026-09-25"],
    ["Oct 3, 2026", "2026-10-03"],
    ["29 Sept 2026", "2026-09-29"],
    [1760000000000, "2025-10-09"],
  ])("%s", (input, out) => expect(parsePosted(input, now)).toBe(out));
});

describe("detectCountry", () => {
  it.each([
    ["Abu Dhabi", "AE"],
    ["Ras Laffan, Qatar", "QA"],
    ["Dhahran, Eastern Province", "SA"],
    ["Houston, TX", "US"],
    ["Aberdeen, Scotland", "GB"],
    ["Kuala Lumpur", "MY"],
    ["Navi Mumbai, Maharashtra", "IN"],
    ["Lagos, NG", "NG"],
    ["Papua New Guinea", "PG"],
    ["New Mexico, US", "US"],
    ["Los Angeles, CA", undefined],
    ["CARTAGENA, MC, ES", "ES"],
    ["TX, US, 77056", "US"],
    ["Perth, WA, AUS, ", "AU"],
  ])("%s -> %s", (loc, iso) => expect(detectCountry(loc)).toBe(iso));
});

describe("robots", () => {
  const rules = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nAllow: /jobs/\nDisallow: /search\nDisallow: /private/*.pdf$");
  it("applies only the * group", () => {
    expect(isAllowed(rules, "/jobs/123")).toBe(true);
    expect(isAllowed(rules, "/about")).toBe(true);
    expect(isAllowed(rules, "/search?q=safety")).toBe(false);
    expect(isAllowed(rules, "/private/a.pdf")).toBe(false);
  });
});

describe("detectFromUrl", () => {
  it("workday", () =>
    expect(detectFromUrl("https://shell.wd3.myworkdayjobs.com/en-US/ShellCareers")).toEqual({
      type: "workday", host: "shell.wd3.myworkdayjobs.com", tenant: "shell", site: "ShellCareers",
    }));
  it("oracle", () =>
    expect(detectFromUrl("https://abc.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions")).toEqual({
      type: "oracle", host: "abc.fa.em2.oraclecloud.com", siteNumber: "CX_1",
    }));
  it("greenhouse", () => expect(detectFromUrl("https://boards.greenhouse.io/acme")?.board).toBe("acme"));
  it("unknown", () => expect(detectFromUrl("https://www.example.com/careers")).toBeNull());
});
