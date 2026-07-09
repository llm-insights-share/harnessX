import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir } from "./paths.js";
import { createWorkOrder, submitWorkOrder } from "./workorder.js";
import { sha256 } from "./telemetry.js";

const REQ_EXTENDED_FILES = [
  "prd-summary.md",
  "user-stories.md",
  "nfr.md",
  "research-report.md",
  "business-concepts.md",
  "business-flows.md"
];

export function scaffoldExtendedRequirements(ws: Workspace, change: string): string[] {
  const reqDir = ws.requirementsDir(change);
  ensureDir(reqDir);
  const created: string[] = [];
  for (const f of REQ_EXTENDED_FILES) {
    const p = path.join(reqDir, f);
    if (!fs.existsSync(p)) {
      const title = f.replace(/\.md$/, "").replace(/-/g, " ");
      fs.writeFileSync(p, `# ${title}\n\n<!-- Fill for enterprise-sdlc requirements analysis -->\n`, "utf8");
      created.push(`requirements/${f}`);
    }
  }
  const intDir = path.join(reqDir, "integrations");
  ensureDir(intDir);
  const index = path.join(intDir, "index.md");
  if (!fs.existsSync(index)) {
    fs.writeFileSync(index, "# External Integrations\n\n| System | Protocol | Owner | Spec |\n|--------|----------|-------|------|\n", "utf8");
    created.push("requirements/integrations/index.md");
  }
  return created;
}

export function requirementsExtendedProblems(ws: Workspace, change: string): string[] {
  const problems: string[] = [];
  const reqDir = ws.requirementsDir(change);
  if (!fs.existsSync(reqDir)) {
    problems.push("requirements/ directory missing");
    return problems;
  }
  for (const f of REQ_EXTENDED_FILES) {
    const p = path.join(reqDir, f);
    if (!fs.existsSync(p)) problems.push(`missing requirements/${f}`);
    else {
      const text = fs.readFileSync(p, "utf8");
      if (text.includes("<!-- Fill for enterprise-sdlc")) problems.push(`requirements/${f} is still a scaffold placeholder`);
    }
  }
  const intIndex = path.join(reqDir, "integrations", "index.md");
  if (!fs.existsSync(intIndex)) problems.push("missing requirements/integrations/index.md");
  return problems;
}

export function scaffoldTestCases(ws: Workspace, change: string): string {
  const dir = ws.testCasesDir(change);
  ensureDir(dir);
  const overview = path.join(dir, "overview.md");
  if (!fs.existsSync(overview)) {
    fs.writeFileSync(
      overview,
      `# Test Cases: ${change}

| Case ID | Scenario | Priority | Steps | Expected | Status |
|---------|----------|----------|-------|----------|--------|
| TC-001 | | P1 | | | draft |
`,
      "utf8"
    );
  }
  return overview;
}

export function testCasesProblems(ws: Workspace, change: string): string[] {
  const problems: string[] = [];
  const overview = path.join(ws.testCasesDir(change), "overview.md");
  if (!fs.existsSync(overview)) {
    problems.push("test-cases/overview.md missing — run hx test-cases init");
    return problems;
  }
  const text = fs.readFileSync(overview, "utf8");
  if (!/\| TC-\d+/.test(text)) {
    problems.push("test-cases/overview.md must list at least one test case row (TC-001)");
  }
  return problems;
}

export function testCasesArtifactHash(ws: Workspace, change: string): string {
  const dir = ws.testCasesDir(change);
  if (!fs.existsSync(dir)) return "";
  let content = "";
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isFile()) content += fs.readFileSync(p, "utf8");
  }
  return content ? sha256(content) : "";
}

export function submitTestCaseReview(ws: Workspace, change: string, by: string): string {
  scaffoldTestCases(ws, change);
  const wo = createWorkOrder(ws, {
    type: "test-case-review",
    title: `Review test cases for ${change}`,
    scope: "change",
    ref: { change },
    assigneeRole: "tech-manager",
    createdBy: by,
    artifacts: [{ path: `harnessX/changes/${change}/test-cases/overview.md` }]
  });
  submitWorkOrder(ws, wo.id, by);
  return wo.id;
}

export function submitTestRun(ws: Workspace, change: string, by: string): string {
  const wo = createWorkOrder(ws, {
    type: "test-run",
    title: `Execute tests for ${change}`,
    scope: "change",
    ref: { change },
    assigneeRole: "tester",
    createdBy: by
  });
  submitWorkOrder(ws, wo.id, by);
  return wo.id;
}
