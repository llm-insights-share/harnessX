import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir, writeYaml } from "./paths.js";
import { initMeta } from "./metaStore.js";

export interface ImportResult {
  specs: string[];
  changes: string[];
  notes: string[];
}

/**
 * NFR-004: `hx openspec import` maps an existing openspec/ tree into harnessX/.
 * specs/<cap>/spec.md and changes/<id>/ transfer directly; missing harness files are seeded.
 * Alternatively `compat_mode: openspec` in config.yaml keeps using the openspec/ dir in place.
 */
export function importOpenspec(root: string, openspecDir: string, ws: Workspace): ImportResult {
  const res: ImportResult = { specs: [], changes: [], notes: [] };
  const specsSrc = path.join(openspecDir, "specs");
  if (fs.existsSync(specsSrc)) {
    for (const cap of fs.readdirSync(specsSrc, { withFileTypes: true })) {
      if (!cap.isDirectory()) continue;
      const src = path.join(specsSrc, cap.name, "spec.md");
      if (!fs.existsSync(src)) continue;
      const dest = path.join(ws.specsDir, cap.name, "spec.md");
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
      res.specs.push(cap.name);
    }
  }
  const changesSrc = path.join(openspecDir, "changes");
  if (fs.existsSync(changesSrc)) {
    for (const ch of fs.readdirSync(changesSrc, { withFileTypes: true })) {
      if (!ch.isDirectory() || ch.name === "archive") continue;
      const destDir = ws.changeDir(ch.name);
      ensureDir(destDir);
      copyDir(path.join(changesSrc, ch.name), destDir);
      if (!fs.existsSync(ws.metaFile(ch.name))) {
        initMeta(ws, ch.name, "standard", inferDomains(destDir));
        res.notes.push(`seeded meta.yaml for imported change "${ch.name}"`);
      }
      res.changes.push(ch.name);
    }
  }
  const projectMd = path.join(openspecDir, "project.md");
  if (fs.existsSync(projectMd) && !fs.existsSync(ws.constitutionFile)) {
    fs.copyFileSync(projectMd, ws.constitutionFile);
    res.notes.push("imported project.md as constitution.md");
  }
  return res;
}

function inferDomains(changeDir: string): string[] {
  const specsDir = path.join(changeDir, "specs");
  if (!fs.existsSync(specsDir)) return ["core"];
  const caps = fs.readdirSync(specsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  return caps.length ? caps.map((d) => d.name) : ["core"];
}

function copyDir(src: string, dest: string) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
