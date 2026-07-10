import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Workspace } from "./paths.js";
import { buildContextPack } from "./guideEngine.js";
import type { DeliveryStage } from "./stages.js";

/**
 * v0.2 P2: Guide behavior eval harness — offline checks that Context Packs
 * include expected guides for each stage/task.
 */

export interface GuideEvalCase {
  id: string;
  stage: DeliveryStage;
  task: string;
  expectGuideIds: string[];
  expectContent?: string[];
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

const bundledEvalsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../evals/guide-behavior.json"
);

export function loadGuideEvalCases(customPath?: string): GuideEvalCase[] {
  const p = customPath ?? bundledEvalsPath;
  if (!fs.existsSync(p)) return defaultEvalCases();
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Array<GuideEvalCase & { phase?: string }>;
  return raw.map((c) =>
    c.stage && c.task
      ? c
      : {
          ...c,
          stage: (c.stage ?? "dev") as DeliveryStage,
          task: c.task ?? c.phase ?? "propose"
        }
  );
}

function defaultEvalCases(): GuideEvalCase[] {
  return [
    {
      id: "propose-has-template",
      stage: "dev",
      task: "propose",
      expectGuideIds: ["proposal-template", "cmd-propose"],
      expectContent: ["Constitution"]
    },
    {
      id: "apply-no-proposal-noise",
      stage: "dev",
      task: "apply",
      expectGuideIds: ["coding-conventions", "cmd-apply"],
      forbidContent: ["You are running the **propose** phase"]
    },
    {
      id: "design-has-spec-writing",
      stage: "dev",
      task: "design",
      expectGuideIds: ["spec-writing", "cmd-design"]
    }
  ];
}

export function runGuideEvals(ws: Workspace, change: string, cases?: GuideEvalCase[]): GuideEvalReport {
  const evalCases = cases ?? loadGuideEvalCases();
  const results: GuideEvalResult[] = [];

  for (const c of evalCases) {
    const pack = buildContextPack(ws, change, c.stage, c.task);
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
