import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { buildContextPack } from "./guideEngine.js";
import { harnessxPackageRoot } from "./packageRoot.js";

/**
 * v0.2 P2: Guide behavior eval harness — offline checks that Context Packs
 * include expected guides for each phase (inspired by superpowers-evals).
 */

export interface GuideEvalCase {
  id: string;
  phase: string;
  expectGuideIds: string[];
  /** Substrings that must appear somewhere in the assembled pack */
  expectContent?: string[];
  /** Substrings that must NOT appear (instruction pollution check) */
  forbidContent?: string[];
}

export interface GuideEvalResult {
  id: string;
  passed: boolean;
  missingGuides: string[];
  missingContent: string[];
  forbiddenFound: string[];
}

export interface GuideEvalReport {
  passed: boolean;
  results: GuideEvalResult[];
}

const bundledEvalsPath = path.join(harnessxPackageRoot(), "packages", "core", "evals", "guide-behavior.json");

export function loadGuideEvalCases(customPath?: string): GuideEvalCase[] {
  const p = customPath ?? bundledEvalsPath;
  if (!fs.existsSync(p)) return defaultEvalCases();
  return JSON.parse(fs.readFileSync(p, "utf8")) as GuideEvalCase[];
}

function defaultEvalCases(): GuideEvalCase[] {
  return [
    {
      id: "propose-has-template",
      phase: "propose",
      expectGuideIds: ["proposal-template", "cmd-propose"],
      expectContent: ["Constitution"]
    },
    {
      id: "apply-no-proposal-noise",
      phase: "apply",
      expectGuideIds: ["coding-conventions", "cmd-apply"],
      forbidContent: ["You are running the **propose** phase"]
    },
    {
      id: "spec-has-spec-writing",
      phase: "spec",
      expectGuideIds: ["spec-writing", "cmd-spec"]
    }
  ];
}

export function runGuideEvals(ws: Workspace, change: string, cases?: GuideEvalCase[]): GuideEvalReport {
  const evalCases = cases ?? loadGuideEvalCases();
  const results: GuideEvalResult[] = [];

  for (const c of evalCases) {
    const pack = buildContextPack(ws, change, c.phase);
    const guideIds = pack.sections
      .filter((s) => s.title.startsWith("Guide:"))
      .map((s) => {
        const m = s.title.match(/^Guide: (\S+)/);
        return m?.[1] ?? "";
      })
      .filter(Boolean);
    const fullText = pack.sections.map((s) => s.content).join("\n");

    const missingGuides = c.expectGuideIds.filter((id) => !guideIds.includes(id));
    const missingContent = (c.expectContent ?? []).filter((sub) => !fullText.includes(sub));
    const forbiddenFound = (c.forbidContent ?? []).filter((sub) => fullText.includes(sub));

    results.push({
      id: c.id,
      passed: missingGuides.length === 0 && missingContent.length === 0 && forbiddenFound.length === 0,
      missingGuides,
      missingContent,
      forbiddenFound
    });
  }

  return { passed: results.every((r) => r.passed), results };
}
