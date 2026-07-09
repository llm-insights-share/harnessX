import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeYaml } from "@harnessx/core";
import {
  hubPackageDirForKind,
  resolveHubPackageDir,
  walkHubPackages,
  kindToPackageSegments
} from "@harnessx/core";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hub-pkg-path-"));
}

describe("hub package kind paths", () => {
  it("maps kind to package segments", () => {
    expect(kindToPackageSegments("guide.template")).toEqual(["guide", "template"]);
    expect(kindToPackageSegments("sensor.rubric")).toEqual(["sensor", "rubric"]);
  });

  it("resolves kind-scoped and legacy flat package layouts", () => {
    const hub = tmp();
    const kindDir = hubPackageDirForKind(hub, "guide.skill", "api-conventions", "1.0.0");
    fs.mkdirSync(kindDir, { recursive: true });
    writeYaml(path.join(kindDir, "asset.yaml"), {
      id: "api-conventions",
      kind: "guide.skill",
      version: "1.0.0",
      status: "trial"
    });
    fs.writeFileSync(path.join(kindDir, "SKILL.md"), "# Skill\n");

    const legacyDir = path.join(hub, "packages", "legacy-skill", "1.0.0");
    fs.mkdirSync(legacyDir, { recursive: true });
    writeYaml(path.join(legacyDir, "asset.yaml"), {
      id: "legacy-skill",
      kind: "guide.skill",
      version: "1.0.0",
      status: "trial"
    });

    expect(resolveHubPackageDir(hub, { id: "api-conventions", version: "1.0.0" })).toBe(kindDir);
    expect(resolveHubPackageDir(hub, { id: "legacy-skill", version: "1.0.0" })).toBe(legacyDir);
    expect(walkHubPackages(hub).map((p) => p.id).sort()).toEqual(["api-conventions", "legacy-skill"]);
  });
});
