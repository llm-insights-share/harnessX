import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Workspace } from "./paths.js";

/**
 * T-205 (NFR-001): relevance heuristics for fast suites.
 * Builds a shallow import graph over JS/TS sources and selects the test files
 * transitively affected by the current diff, so fast gates stay under budget.
 */

export function gitChangedFiles(root: string): string[] {
  const res = spawnSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
  if (res.status !== 0) return [];
  const staged = spawnSync("git", ["diff", "--name-only", "--cached"], { cwd: root, encoding: "utf8" });
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  return [
    ...new Set(
      [res.stdout, staged.stdout ?? "", untracked.stdout ?? ""]
        .join("\n")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ];
}

const IMPORT_RE = /(?:import\s[^"']*|from\s*|require\()\s*["']([^"']+)["']/g;

function collectSources(root: string, dirs: string[]): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) visit(p);
      else if (/\.[jt]sx?$/.test(e.name)) out.push(p);
    }
  };
  for (const d of dirs) visit(path.join(root, d));
  return out;
}

function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [base, base.replace(/\.js$/, ".ts"), `${base}.ts`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.js")]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

/** reverse dependency map: file -> files that import it */
export function buildReverseGraph(root: string, dirs = ["src", "packages", "tests", "test"]): Map<string, Set<string>> {
  const rev = new Map<string, Set<string>>();
  for (const file of collectSources(root, dirs)) {
    const content = fs.readFileSync(file, "utf8");
    for (const m of content.matchAll(IMPORT_RE)) {
      const target = resolveImport(file, m[1]);
      if (!target) continue;
      const key = path.relative(root, target);
      if (!rev.has(key)) rev.set(key, new Set());
      rev.get(key)!.add(path.relative(root, file));
    }
  }
  return rev;
}

/** Test files transitively affected by the changed files. */
export function relatedTests(root: string, changedFiles: string[], dirs?: string[]): string[] {
  const rev = buildReverseGraph(root, dirs);
  const affected = new Set<string>(changedFiles);
  const queue = [...changedFiles];
  while (queue.length) {
    const f = queue.shift()!;
    for (const dep of rev.get(f) ?? []) {
      if (!affected.has(dep)) {
        affected.add(dep);
        queue.push(dep);
      }
    }
  }
  return [...affected].filter((f) => /\.(test|spec)\.[jt]sx?$/.test(f)).sort();
}
