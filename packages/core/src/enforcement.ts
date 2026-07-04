import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./paths.js";

/**
 * T-207/T-208 (FR-051): local git hooks + CI replay workflow.
 * L2: hooks run `hx gate check --hook` before commit/push.
 * L3: CI replays gate checks + trace check + meta verify; bypassed local
 * checks are therefore caught server-side.
 */

const HOOK_BODY = (kind: string) => `#!/bin/sh
# installed by hx hooks install (HarnessX FR-051) — do not edit
echo "[hx] ${kind}: running gate check"
hx gate hook-check || {
  echo "[hx] ${kind} blocked by harness gate. Bypassing with --no-verify will be caught by CI replay."
  exit 1
}
`;

export function installHooks(repoRoot: string): string[] {
  const hooksDir = path.join(repoRoot, ".git", "hooks");
  if (!fs.existsSync(path.join(repoRoot, ".git"))) throw new Error("not a git repository — cannot install hooks");
  ensureDir(hooksDir);
  const installed: string[] = [];
  for (const hook of ["pre-commit", "pre-push"]) {
    const f = path.join(hooksDir, hook);
    fs.writeFileSync(f, HOOK_BODY(hook), { mode: 0o755 });
    installed.push(f);
  }
  return installed;
}

const CI_WORKFLOW = `name: harness-verify
# L3 enforcement (FR-051): replays gate checks server-side so that bypassed
# local hooks (--no-verify) cannot land unverified changes.
on:
  pull_request:
  push:
    branches: [main]
jobs:
  harness-verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - name: Replay gates for active changes
        run: npx hx gate replay
      - name: Verify meta.yaml integrity (FR-050)
        run: npx hx meta verify --all
      - name: Traceability check (FR-023)
        run: npx hx trace check --all
      - name: Fixture hash check (FR-025)
        run: npx hx fixture verify
`;

const CODEOWNERS_DOC = `# Branch protection & CODEOWNERS setup (FR-012 / FR-051)

1. Protect \`main\`: require the \`harness-verify\` status check and >=1 review.
2. Add a CODEOWNERS entry so spec changes always get human review:

\`\`\`
# .github/CODEOWNERS
harnessX/specs/            @your-org/spec-owners
harnessX/changes/**/specs/ @your-org/spec-owners
harnessX/constitution.md   @your-org/architects
tests/fixtures/            @your-org/qa
\`\`\`

3. Disallow force-pushes to \`main\`; the meta.yaml logHash chain relies on history.
`;

export function ciInit(repoRoot: string): string[] {
  const wfDir = path.join(repoRoot, ".github", "workflows");
  ensureDir(wfDir);
  const wf = path.join(wfDir, "harness-verify.yml");
  fs.writeFileSync(wf, CI_WORKFLOW);
  const doc = path.join(repoRoot, ".github", "BRANCH_PROTECTION.md");
  fs.writeFileSync(doc, CODEOWNERS_DOC);
  return [wf, doc];
}
