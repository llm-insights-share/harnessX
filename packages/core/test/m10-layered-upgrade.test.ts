import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Workspace,
  initWorkspace,
  initFromHub,
  hubAdd,
  hubSync,
  hubSyncApply,
  seedGoldenHub,
  listGoldenHubPackages,
  threeWayMergeText,
  readBlueprint,
  resolveCompensation,
  hubEvalPackage,
  steerPublish,
  writeLock,
  writeYaml,
  loadAssetDir
} from "@harnessx/core";
import { compileAdapters, computeTier, TARGETS } from "@harnessx/adapters";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m10-"));

function makeAsset(dir: string, id: string, over: Record<string, unknown> = {}, content = `# Skill: ${id}\n\n- Be excellent.\n`) {
  fs.mkdirSync(dir, { recursive: true });
  writeYaml(path.join(dir, "asset.yaml"), { id, kind: "guide.skill", version: "1.0.0", status: "trial", stage: "dev", task: "apply", ...over });
  fs.writeFileSync(path.join(dir, "SKILL.md"), content);
}

describe("v0.3 layered upgrade", () => {
  it("three-way merge prefers local overrides and upstream updates", () => {
    const kept = threeWayMergeText("base\n", "base\nlocal\n", "base\n");
    expect(kept.conflict).toBe(false);
    expect(kept.content).toBe("base\nlocal\n");

    const updated = threeWayMergeText("base\n", "base\n", "base\nremote\n");
    expect(updated.conflict).toBe(false);
    expect(updated.content).toBe("base\nremote\n");

    const m2 = threeWayMergeText("a\n", "b\n", "c\n");
    expect(m2.conflict).toBe(true);
    expect(m2.content).toContain("<<<<<<< local");
  });

  it("hub sync --apply fast-forwards when update available without local edits", () => {
    const root = tmp();
    const ws = initWorkspace(root).ws;
    const hub = path.join(root, "hub");
    makeAsset(path.join(hub, "packages/pkg-a/1.0.0"), "pkg-a", { status: "enforced", origin: "hub" });
    hubAdd(ws, hub, { id: "pkg-a", version: "1.0.0" });
    makeAsset(path.join(hub, "packages/pkg-a/1.1.0"), "pkg-a", { status: "enforced", origin: "hub", version: "1.1.0" }, "# Skill: pkg-a\n\n- v1.1\n");

    const results = hubSyncApply(ws, hub);
    expect(results[0].action).toBe("updated");
    expect(loadAssetDir(path.join(ws.base, ".hub-cache/pkg-a"), "hub")!.manifest.version).toBe("1.1.0");
  });

  it("hub sync --apply merges local overrides with upstream updates", () => {
    const root = tmp();
    const ws = initWorkspace(root).ws;
    const hub = path.join(root, "hub");
    makeAsset(path.join(hub, "packages/pkg-b/1.0.0"), "pkg-b", { status: "enforced", origin: "hub" }, "# Skill\n\n- base\n");
    hubAdd(ws, hub, { id: "pkg-b", version: "1.0.0" });
    fs.appendFileSync(path.join(ws.base, ".hub-cache/pkg-b/SKILL.md"), "- local\n");
    makeAsset(path.join(hub, "packages/pkg-b/1.1.0"), "pkg-b", { status: "enforced", origin: "hub", version: "1.1.0" }, "# Skill\n\n- base\n- remote\n");

    const results = hubSyncApply(ws, hub);
    expect(results[0].action).toBe("merged");
    const text = fs.readFileSync(path.join(ws.base, ".hub-cache/pkg-b/SKILL.md"), "utf8");
    expect(text).toContain("- local");
    expect(text).toContain("- remote");
  });

  it("init --from-hub installs api-service bundle from golden hub", () => {
    const root = tmp();
    const hub = path.join(root, "hub");
    seedGoldenHub(hub);
    const res = initFromHub(root, { hubRef: "api-service@1.0.0", hubRoot: hub });
    expect(res.created.some((c) => c.includes("hub bundle"))).toBe(true);
    expect(fs.existsSync(path.join(res.ws.bundlesDir, "api-service"))).toBe(true);
    const config = res.ws.readConfig();
    expect(config.hub).toBe(hub);
  });

  it("tier compensation strengthens gates for tier-2 adapters", () => {
    const ws = initWorkspace(tmp()).ws;
    writeYaml(ws.configFile, { profile: "standard", adapter: { tier: 2 } });
    const comp = resolveCompensation(ws);
    expect(comp.tier).toBe(2);
    expect(comp.extraSensors).toContain("spec-validate");
    expect(comp.escalateWarnToBlock).toBe(true);
  });

  it("adapter sync writes tier marker file", () => {
    const ws = initWorkspace(tmp()).ws;
    compileAdapters(ws, ["generic"]);
    expect(fs.readFileSync(path.join(ws.root, ".harnessx-adapter-tier"), "utf8").trim()).toBe("2");
    expect(computeTier(TARGETS.codex.capabilities)).toBe(2);
    expect(computeTier(TARGETS.cursor.capabilities)).toBe(1);
  });

  it("golden hub has expanded packages and hub eval passes", () => {
    const pkgs = listGoldenHubPackages();
    const ids = pkgs.map((p) => p.id);
    expect(ids).toContain("prd-writing");
    expect(ids).toContain("prototype-wireframe");
    expect(ids).toContain("uat-checklist");

    const hub = path.join(tmp(), "hub");
    seedGoldenHub(hub);
    for (const id of ["prd-writing", "prototype-wireframe", "uat-checklist"]) {
      const res = hubEvalPackage(hub, { id, version: "1.0.0" });
      expect(res.passed).toBe(true);
    }
  });

  it("blueprint.yaml is scaffolded and can be read", () => {
    const ws = initWorkspace(tmp()).ws;
    const bp = readBlueprint(ws);
    expect(bp?.name).toBe("standard-delivery");
    expect(bp?.hub_deps).toContain("prd-writing@1.0.0");
  });

  it("steer publish runs eval → promote closed loop", () => {
    const root = tmp();
    const ws = initWorkspace(root).ws;
    const hub = path.join(root, "hub");
    fs.mkdirSync(hub, { recursive: true });
    const local = path.join(ws.assetsDir, "guides/team-tip");
    makeAsset(local, "team-tip", { status: "trial", version: "0.3.0" });
    const res = steerPublish(ws, local, hub, { publishedBy: "alice" });
    expect(res.eval.passed).toBe(true);
    expect(fs.existsSync(path.join(hub, "packages/guide/skill/team-tip/0.3.0/asset.yaml"))).toBe(true);
    writeLock(ws);
  });
});
