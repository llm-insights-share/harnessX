import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hxhubBin = path.join(repoRoot, "bin", "hxhub.js");

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hxhub-e2e-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

function hxhub(cwd: string, args: string[], opts: { expectFail?: boolean } = {}): string {
  try {
    return execFileSync("node", [hxhubBin, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    if (opts.expectFail) return `${err.stdout ?? ""}${err.stderr ?? ""}`;
    throw new Error(`hxhub ${args.join(" ")} failed (${err.status}):\n${err.stdout}\n${err.stderr}`);
  }
}

describe("hxhub e2e", () => {
  it("initializes lightweight ops workspace and doctor works", () => {
    const repo = makeRepo();
    const out = hxhub(repo, ["init", ".", "--hub", "./hub", "--actor", "ops"]);
    expect(out).toContain("initialized");
    expect(fs.existsSync(path.join(repo, "harnessX/config.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(repo, "harnessX/roles.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(repo, "harnessX/harness.yaml"))).toBe(false);
  });

  it("creates asset scaffold and prints AI help", () => {
    const repo = makeRepo();
    hxhub(repo, ["init", ".", "--hub", "./hub", "--actor", "ops"]);
    const sourceDir = path.join(repo, "skill-source");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "SKILL.md"), "# Clock Safety\n\nUse monotonic clocks.\n", "utf8");
    const created = hxhub(repo, [
      "asset",
      "create",
      "--kind",
      "guide.skill",
      "--id",
      "clock-safety",
      "--asset-version",
      "1.0.0",
      "--status",
      "draft",
      "--source-dir",
      "./skill-source",
      "--out",
      "./assets/clock-safety"
    ]);
    expect(created).toContain("created");
    expect(fs.existsSync(path.join(repo, "assets/clock-safety/asset.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(repo, "assets/clock-safety/SKILL.md"))).toBe(true);
    expect(fs.readFileSync(path.join(repo, "assets/clock-safety/SKILL.md"), "utf8")).toContain("Use monotonic clocks.");

    const help = hxhub(repo, ["help", "general", "--json"]);
    expect(help).toContain("suggestions");
  });

  it("copies skill resource files from source-dir", () => {
    const repo = makeRepo();
    hxhub(repo, ["init", ".", "--hub", "./hub", "--actor", "ops"]);
    const sourceDir = path.join(repo, "skill-source");
    fs.mkdirSync(path.join(sourceDir, "examples"), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "SKILL.md"), "# Biz\n", "utf8");
    fs.writeFileSync(path.join(sourceDir, "examples", "sample.md"), "# Sample\n", "utf8");
    hxhub(repo, [
      "asset",
      "create",
      "--kind",
      "guide.skill",
      "--id",
      "business-insight",
      "--source-dir",
      sourceDir,
      "--out",
      "./assets/business-insight"
    ]);
    expect(fs.existsSync(path.join(repo, "assets/business-insight/examples/sample.md"))).toBe(true);
    const evalOut = hxhub(repo, ["eval", "--local", "./assets/business-insight"]);
    expect(evalOut).toContain("PASS\tskill package layout");
  });

  it("accepts source file path for asset create", () => {
    const repo = makeRepo();
    const sourceFile = path.join(repo, "功能需求模版.md");
    fs.writeFileSync(sourceFile, "# 功能需求模版\n\n- 目标\n", "utf8");
    hxhub(repo, [
      "asset",
      "create",
      "--kind",
      "guide.template",
      "--id",
      "feature-template",
      "--source-dir",
      sourceFile,
      "--out",
      "./assets/feature-template"
    ]);
    expect(fs.readFileSync(path.join(repo, "assets/feature-template/template.md"), "utf8")).toContain("# 功能需求模版");
  });

  it("seeds hub with profile and scenario dimensions", () => {
    const repo = makeRepo();
    const hubDir = path.join(repo, "hub");
    const out = hxhub(repo, ["seed", hubDir, "--profile", "minimal", "--scenario", "api"]);
    expect(out).toContain("Seeded");
    expect(fs.existsSync(path.join(hubDir, "packages/guide/skill/coding-conventions/1.0.0/asset.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(hubDir, "bundles/api-service/1.0.0/bundle.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(hubDir, "packages/guide/template/ui-page-spec-template/1.0.0/asset.yaml"))).toBe(false);
  });

  it("fix repairs missing hub policy and maintainers", () => {
    const repo = makeRepo();
    hxhub(repo, ["init", ".", "--hub", "./hub", "--actor", "ops"]);
    fs.mkdirSync(path.join(repo, "hub"), { recursive: true });

    const out = hxhub(repo, ["fix", "--hub", "./hub", "--maintainer", "zhangsan"]);
    expect(out).toContain("add_maintainer");

    const policyPath = path.join(repo, "hub", "hub-policy.yaml");
    expect(fs.existsSync(policyPath)).toBe(true);
    const policy = YAML.parse(fs.readFileSync(policyPath, "utf8")) as { maintainers?: string[] };
    expect(policy.maintainers).toContain("zhangsan");
  });

  it("eval --local does not require pkg argument", () => {
    const repo = makeRepo();
    hxhub(repo, ["init", ".", "--hub", "./hub", "--actor", "ops"]);
    const sourceDir = path.join(repo, "skill-source");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "SKILL.md"), "# Test Skill\n", "utf8");
    hxhub(repo, [
      "asset",
      "create",
      "--kind",
      "guide.skill",
      "--id",
      "business-insight",
      "--asset-version",
      "1.0.0",
      "--source-dir",
      sourceDir,
      "--out",
      "./assets/business-insight"
    ]);
    const out = hxhub(repo, ["eval", "--local", "./assets/business-insight"]);
    expect(out).toContain("PASS\tasset.yaml exists");
    expect(out).toContain("PASS\tSKILL.md present");
  });
});
