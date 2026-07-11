import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import {
  parseGitHubSkillRef,
  defaultSkillId,
  resolveSkillSourceDir,
  resolveLocalSkillSourceDir,
  installGuideSkillAsset,
  installSkillFromGitHub
} from "../src/hubInstallSkill.js";

describe("parseGitHubSkillRef", () => {
  it("parses git ssh URL", () => {
    expect(parseGitHubSkillRef("git@github.com:org/my-skill.git")).toEqual({
      repoUrl: "git@github.com:org/my-skill.git"
    });
  });

  it("parses https repo URL", () => {
    expect(parseGitHubSkillRef("https://github.com/org/my-skill")).toEqual({
      repoUrl: "https://github.com/org/my-skill.git"
    });
  });

  it("parses tree URL with branch and subpath", () => {
    expect(parseGitHubSkillRef("https://github.com/org/repo/tree/main/skills/clock")).toEqual({
      repoUrl: "https://github.com/org/repo.git",
      branch: "main",
      subpath: "skills/clock"
    });
  });

  it("parses blob URL pointing at SKILL.md", () => {
    expect(parseGitHubSkillRef("https://github.com/org/repo/blob/main/skills/clock/SKILL.md")).toEqual({
      repoUrl: "https://github.com/org/repo.git",
      branch: "main",
      subpath: "skills/clock"
    });
  });
});

describe("installGuideSkillAsset", () => {
  let root: string;
  let repoDir: string;
  let localSkillDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hx-install-skill-"));
    repoDir = path.join(root, "repo");
    localSkillDir = path.join(root, "local-skill");
    fs.mkdirSync(path.join(repoDir, "references"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "SKILL.md"), "# Clock safety\n", "utf8");
    fs.writeFileSync(path.join(repoDir, "references", "notes.md"), "# Notes\n", "utf8");

    fs.mkdirSync(path.join(localSkillDir, "references"), { recursive: true });
    fs.writeFileSync(path.join(localSkillDir, "SKILL.md"), "# Local skill\n", "utf8");
    fs.writeFileSync(path.join(localSkillDir, "references", "guide.md"), "# Guide\n", "utf8");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("scaffolds skill asset from GitHub repo override", () => {
    const outDir = path.join(root, "packages", "guide", "skill", "clock-safety", "1.0.0");
    const result = installGuideSkillAsset({
      workspaceRoot: root,
      githubUrl: "https://github.com/org/clock-safety",
      id: "clock-safety",
      outDir,
      repoDirOverride: repoDir,
      skipEval: false
    });

    expect(result.dir).toBe(outDir);
    expect(result.source).toBe("github");
    expect(fs.existsSync(path.join(outDir, "asset.yaml"))).toBe(true);
    expect(fs.readFileSync(path.join(outDir, "SKILL.md"), "utf8")).toContain("Clock safety");
    expect(fs.existsSync(path.join(outDir, "references", "notes.md"))).toBe(true);
    expect(result.eval?.passed).toBe(true);

    const manifest = YAML.parse(fs.readFileSync(path.join(outDir, "asset.yaml"), "utf8")) as {
      kind: string;
      provenance: { type: string }[];
    };
    expect(manifest.kind).toBe("guide.skill");
    expect(manifest.provenance.some((p) => p.type === "github-skill-install")).toBe(true);
  });

  it("scaffolds skill asset from local source directory", () => {
    const outDir = path.join(root, "assets", "local-skill");
    const result = installGuideSkillAsset({
      workspaceRoot: root,
      sourceDir: localSkillDir,
      id: "local-skill",
      outDir,
      skipEval: false
    });

    expect(result.dir).toBe(outDir);
    expect(result.source).toBe("local");
    expect(fs.readFileSync(path.join(outDir, "SKILL.md"), "utf8")).toContain("Local skill");
    expect(fs.existsSync(path.join(outDir, "references", "guide.md"))).toBe(true);
    expect(result.eval?.passed).toBe(true);

    const manifest = YAML.parse(fs.readFileSync(path.join(outDir, "asset.yaml"), "utf8")) as {
      provenance: { type: string }[];
    };
    expect(manifest.provenance.some((p) => p.type === "local-skill-source")).toBe(true);
  });

  it("resolves nested skill path", () => {
    const nested = path.join(repoDir, "skills", "nested");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "SKILL.md"), "# Nested\n", "utf8");

    expect(resolveSkillSourceDir(repoDir, "skills/nested")).toBe(nested);
    expect(resolveLocalSkillSourceDir(localSkillDir)).toBe(localSkillDir);
    expect(defaultSkillId("https://github.com/org/repo.git", "skills/nested")).toBe("nested");
  });

  it("keeps installSkillFromGitHub as deprecated wrapper", () => {
    const outDir = path.join(root, "legacy");
    const result = installSkillFromGitHub({
      workspaceRoot: root,
      url: "https://github.com/org/clock-safety",
      id: "clock-safety",
      outDir,
      repoDirOverride: repoDir,
      skipEval: true
    });
    expect(result.repoUrl).toBe("https://github.com/org/clock-safety.git");
    expect(fs.existsSync(path.join(outDir, "SKILL.md"))).toBe(true);
  });
});
