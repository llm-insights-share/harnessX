import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveSkillRoot,
  listSkillContentFiles,
  loadSkillPackage,
  formatSkillResourceAppendix
} from "../src/skill.js";

describe("skill package", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-pkg-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeSkill(id: string, extras: Record<string, string> = {}) {
    const dir = path.join(root, "assets", "guides", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "asset.yaml"), "id: test\n", "utf8");
    fs.writeFileSync(path.join(dir, "SKILL.md"), `# ${id}\n`, "utf8");
    for (const [rel, content] of Object.entries(extras)) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf8");
    }
    return dir;
  }

  it("resolveSkillRoot accepts directory source", () => {
    const dir = writeSkill("foo");
    const rel = path.relative(root, dir).replace(/\\/g, "/");
    expect(resolveSkillRoot(root, rel)).toBe(dir);
  });

  it("resolveSkillRoot accepts SKILL.md file source", () => {
    const dir = writeSkill("bar");
    const rel = path.join(path.relative(root, dir), "SKILL.md").replace(/\\/g, "/");
    expect(resolveSkillRoot(root, rel)).toBe(dir);
  });

  it("listSkillContentFiles returns all package files", () => {
    const dir = writeSkill("baz", { "examples/a.md": "example\n" });
    const files = listSkillContentFiles(dir);
    expect(files).toContain("SKILL.md");
    expect(files).toContain("examples/a.md");
    expect(files).not.toContain("asset.yaml");
  });

  it("loadSkillPackage loads entry and resource files", () => {
    writeSkill("biz", { "references/frame.md": "# Frame\n" });
    const pkg = loadSkillPackage(root, "assets/guides/biz");
    expect(pkg.rootRel).toBe("assets/guides/biz");
    expect(pkg.entryContent).toContain("# biz");
    expect(pkg.files.map((f) => f.rel)).toContain("references/frame.md");
  });

  it("formatSkillResourceAppendix inlines non-entry text files", () => {
    writeSkill("inline", { "examples/x.md": "body\n" });
    const pkg = loadSkillPackage(root, "assets/guides/inline");
    const appendix = formatSkillResourceAppendix("inline", pkg);
    expect(appendix).toContain("## Skill resources: inline");
    expect(appendix).toContain("### examples/x.md");
    expect(appendix).toContain("body");
  });
});
