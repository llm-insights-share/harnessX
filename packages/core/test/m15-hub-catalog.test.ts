import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { buildHubCatalog, queryHubCatalog, writeHubCatalog } from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m15-"));

describe("hub catalog", () => {
  it("indexes package metadata and supports filters", () => {
    const hub = tmp();
    const pkgDir = path.join(hub, "packages", "pkg-a", "1.0.0");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "asset.yaml"),
      YAML.stringify({
        id: "pkg-a",
        kind: "guide.skill",
        version: "1.0.0",
        status: "trial",
        execution: "inferential",
        stage: "dev",
        task: "propose"
      })
    );
    fs.writeFileSync(path.join(pkgDir, "SKILL.md"), "# skill\n");
    fs.writeFileSync(
      path.join(pkgDir, ".hub-meta.yaml"),
      YAML.stringify({ id: "pkg-a", version: "1.0.0", category: "package", status: "trial", owner: "platform", stages: ["dev"] })
    );
    fs.writeFileSync(path.join(pkgDir, ".hub-review.yaml"), YAML.stringify({ status: "approved", approvedBy: ["alice"] }));

    const entries = buildHubCatalog(hub);
    expect(entries).toHaveLength(1);
    expect(entries[0].owner).toBe("platform");
    expect(entries[0].review).toBe("approved");

    const filtered = queryHubCatalog(hub, { stage: "dev", status: "trial" });
    expect(filtered).toHaveLength(1);

    const file = writeHubCatalog(hub);
    expect(fs.existsSync(file)).toBe(true);
  });
});
