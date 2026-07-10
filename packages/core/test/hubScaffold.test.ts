import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAssetScaffold } from "../src/hubScaffold.js";

describe("hubScaffold guide.skill", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hx-scaffold-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("copies resource files from source-dir", () => {
    const sourceDir = path.join(root, "source");
    fs.mkdirSync(path.join(sourceDir, "references"), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "SKILL.md"), "# Source skill\n", "utf8");
    fs.writeFileSync(path.join(sourceDir, "references", "frame.md"), "# Frame\n", "utf8");

    const outDir = path.join(root, "assets", "my-skill");
    const res = createAssetScaffold({
      rootDir: outDir,
      id: "my-skill",
      kind: "guide.skill",
      sourceDir
    });

    expect(res.files).toContain("references/frame.md");
    expect(fs.readFileSync(path.join(outDir, "references", "frame.md"), "utf8")).toContain("# Frame");
    expect(fs.readFileSync(path.join(outDir, "SKILL.md"), "utf8")).toContain("# Source skill");
  });
});
