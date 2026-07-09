import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";
import {
  Workspace,
  initWorkspace,
  hubPromote,
  hubEvalAsset,
  hubAdd,
  seedGoldenHub,
  readHubConnection,
  assertHubAction,
  hubSubmit,
  hubAcceptContribution,
  listHubContributions,
  resolveHubDestDir,
  hubCategoryFromKind,
  resolveHubContext,
  writeYaml
} from "../src/index.js";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hx-m28-"));
}

function writeConfig(ws: Workspace, hub: unknown) {
  const cfg = YAML.parse(fs.readFileSync(ws.configFile, "utf8")) as Record<string, unknown>;
  cfg.hub = hub;
  writeYaml(ws.configFile, cfg);
}

function makeAsset(dir: string, id: string, extra: Record<string, unknown> = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "asset.yaml"),
    YAML.stringify({
      id,
      kind: "guide.skill",
      version: "1.0.0",
      origin: "local",
      status: "trial",
      execution: "inferential",
      phase: ["design"],
      provenance: [],
      ...extra
    })
  );
  fs.writeFileSync(path.join(dir, "SKILL.md"), `# ${id}\n`);
}

describe("m28 hub dual-role ops", () => {
  let root: string;
  let hub: string;

  beforeEach(() => {
    root = tmp();
    hub = path.join(root, "hub");
    seedGoldenHub(hub);
  });

  it("category-aware hubPromote writes bundles to bundles/", () => {
    const ws = initWorkspace(path.join(root, "consumer")).ws;
    const bundleDir = path.join(root, "bundle-src");
    fs.mkdirSync(path.join(bundleDir, "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(bundleDir, "asset.yaml"),
      YAML.stringify({
        id: "my-bundle",
        kind: "harness.bundle",
        version: "1.0.0",
        origin: "local",
        status: "trial",
        provenance: []
      })
    );
    fs.writeFileSync(path.join(bundleDir, "bundle.yaml"), YAML.stringify({ description: "test", guides: [], sensors: [] }));

    const { dest } = hubPromote(ws, hub, bundleDir, { publishedBy: "ops", skipEval: true });
    expect(dest).toContain(path.join("bundles", "my-bundle", "1.0.0"));
    expect(hubCategoryFromKind("harness.bundle")).toBe("bundle");
    expect(resolveHubDestDir(hub, { id: "my-bundle", version: "1.0.0", kind: "harness.bundle" })).toBe(dest);
  });

  it("hubEvalAsset routes to bundle directory", () => {
    const res = hubEvalAsset(hub, { id: "api-service", version: "1.0.0" });
    expect(res.passed).toBe(true);
    expect(res.package).toContain("api-service");
  });

  it("consumer cannot promote; maintainer cannot submit", () => {
    const consumer = initWorkspace(path.join(root, "c")).ws;
    writeConfig(consumer, { source: hub, role: "consumer", actor: "dev.a" });
    expect(() => assertHubAction(consumer, "hub.promote")).toThrow(/denied/);

    const maint = initWorkspace(path.join(root, "m")).ws;
    writeConfig(maint, { source: hub, role: "maintainer", actor: "ops.z" });
    expect(() => assertHubAction(maint, "hub.submit")).toThrow(/denied/);
  });

  it("submit → accept merges contribution to official packages", () => {
    const consumer = initWorkspace(path.join(root, "app")).ws;
    writeConfig(consumer, { source: hub, role: "consumer", actor: "wang.dev" });
    const local = path.join(consumer.assetsDir, "guides/team-tip");
    makeAsset(local, "team-tip", { version: "0.2.0" });

    const submitted = hubSubmit(consumer, hub, local, { actor: "wang.dev", skipEval: true });
    expect(submitted.dest).toContain("contributions/wang.dev/team-tip/0.2.0");

    const maint = initWorkspace(path.join(root, "ops")).ws;
    writeConfig(maint, { source: hub, role: "maintainer", actor: "zhao.platform" });
    fs.writeFileSync(
      path.join(hub, "hub-policy.yaml"),
      YAML.stringify({ version: "1.0", maintainers: ["zhao.platform"], minApprovals: 1, consumerCanSubmit: true, installRequiresApproval: true })
    );

    const accepted = hubAcceptContribution(hub, { actor: "wang.dev", id: "team-tip", version: "0.2.0" }, "zhao.platform");
    expect(accepted.dest).toContain(path.join("packages", "guide", "skill", "team-tip", "0.2.0"));
    expect(listHubContributions(hub, { status: "approved" }).length).toBeGreaterThanOrEqual(1);
  });

  it("consumer hubAdd rejects unapproved package when installRequiresApproval", () => {
    const ws = initWorkspace(path.join(root, "use")).ws;
    writeConfig(ws, { source: hub, role: "consumer", actor: "sun" });
    const local = path.join(ws.assetsDir, "guides/pending-pkg");
    makeAsset(local, "pending-pkg", { version: "2.0.0" });
    hubPromote(ws, hub, local, { publishedBy: "ops", skipEval: true });

    expect(() => hubAdd(ws, hub, { id: "pending-pkg", version: "2.0.0" }, { requireApproved: true })).toThrow(/not approved/);
  });

  it("resolveHubContext uses config hub source", () => {
    const ws = initWorkspace(path.join(root, "cfg")).ws;
    writeConfig(ws, { source: hub, role: "consumer", actor: "a" });
    const conn = readHubConnection(ws);
    expect(conn?.source).toBe(hub);
    expect(conn?.role).toBe("consumer");
    const ctx = resolveHubContext(ws, { action: "hub.search" });
    expect(fs.existsSync(ctx.hubRoot)).toBe(true);
  });
});
