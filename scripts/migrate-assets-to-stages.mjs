#!/usr/bin/env node
/**
 * One-shot codemod: harness/guide phase → stage+task (v0.6).
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const PHASE_MAP = {
  explore: { stage: "req", task: "requirements-research" },
  prd: { stage: "req", task: "prd-writing" },
  propose: { stage: "dev", task: "propose" },
  design: { stage: "dev", task: "design" },
  spec: { stage: "dev", task: "design" },
  plan: { stage: "dev", task: "plan" },
  "test-design": { stage: "test", task: "test-case-design" },
  apply: { stage: "dev", task: "apply" },
  verify: { stage: "dev", task: "verify" },
  archive: { stage: "dev", task: "archive" },
  arch: { stage: "arch", task: "subsystem-division" },
  "arch-lld": { stage: "arch", task: "internal-interface" }
};

function mapPhase(phase) {
  return PHASE_MAP[phase] ?? { stage: "dev", task: phase };
}

function migrateGuideOrSensor(item) {
  if (!item.phase?.length) return item;
  const primary = item.phase[0];
  const { stage, task } = mapPhase(primary);
  const { phase: _p, ...rest } = item;
  return { ...rest, stage, task };
}

function migrateHarness(file) {
  const raw = fs.readFileSync(file, "utf8");
  const doc = YAML.parse(raw);
  let changed = false;

  if (doc.profiles) {
    for (const [name, p] of Object.entries(doc.profiles)) {
      if (p.phases) {
        delete p.phases;
        changed = true;
      }
      if (p.suites) {
        const suites = {};
        for (const [k, v] of Object.entries(p.suites)) {
          if (k.includes(".")) {
            suites[k] = v;
          } else {
            const m = mapPhase(k);
            suites[`${m.stage}.${m.task}`] = v;
            changed = true;
          }
        }
        p.suites = suites;
      }
    }
  }

  if (doc.guides) {
    doc.guides = doc.guides.map((g) => {
      if (!g.phase?.length) return g;
      changed = true;
      return migrateGuideOrSensor(g);
    });
  }
  if (doc.sensors) {
    doc.sensors = doc.sensors.map((s) => {
      if (!s.phase?.length) return s;
      changed = true;
      const m = migrateGuideOrSensor(s);
      if (m.trigger === "phase") m.trigger = "task";
      return m;
    });
    doc.sensors = doc.sensors.map((s) => {
      if (s.id === "wo-prephase-clear") {
        changed = true;
        return { ...s, id: "wo-req-arch-clear", builtin: "wo-req-arch-clear", fix_hint: s.fix_hint?.replace("pre-phase", "req/arch") };
      }
      return s;
    });
    if (doc.suites?.["propose-sdlc"]) {
      doc.suites["dev.propose"] = doc.suites["propose-sdlc"].map((id) => (id === "wo-prephase-clear" ? "wo-req-arch-clear" : id));
      delete doc.suites["propose-sdlc"];
      changed = true;
    }
  }

  if (changed) fs.writeFileSync(file, YAML.stringify(doc));
  return changed;
}

function migrateAssetYaml(file) {
  const raw = fs.readFileSync(file, "utf8");
  const doc = YAML.parse(raw);
  if (!doc.phase?.length) return false;
  const { stage, task } = mapPhase(doc.phase[0]);
  delete doc.phase;
  doc.stage = stage;
  doc.task = task;
  fs.writeFileSync(file, YAML.stringify(doc));
  return true;
}

const root = process.argv[2] ?? ".";
let n = 0;
for (const f of [path.join(root, "packages/bundles/base/harness.yaml"), path.join(root, "packages/bundles/hx-cn/harness.yaml")]) {
  if (fs.existsSync(f) && migrateHarness(f)) n++;
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === "asset.yaml") {
      if (migrateAssetYaml(p)) n++;
    }
  }
}
walk(path.join(root, "packages/hub-golden"));

console.log(`migrated ${n} files`);
