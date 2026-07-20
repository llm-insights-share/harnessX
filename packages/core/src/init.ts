import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Workspace, ensureDir, writeYaml } from "./paths.js";
import { writeLock } from "./assets.js";
import { isGitHubHubRef, resolveHubSource } from "./hubSource.js";
import { scaffoldRoles } from "./roles.js";
import {
  applyProfileAssets,
  resolveProfileAssets,
  validateActiveStages,
  type ProfileAssetResolution
} from "./profileAssets.js";
import { BUILTIN_SCAFFOLD_DIR } from "./harnessCompose.js";
import type { DeliveryStage } from "./schemas.js";
import { DEFAULT_PROFILE_STAGES } from "./stages.js";
import { validateScaffoldCompleteness } from "./harnessCompleteness.js";

function copyDir(src: string, dest: string) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export interface InitOptions {
  /** Built-in scaffold: `base` (English) or `hx-cn` (Chinese). */
  locale?: string;
  scaffoldDir?: string;
  /** Optional active stages (local); must be subset of profile stages when profile is set later. */
  stages?: DeliveryStage[];
  profile?: string;
  /** When true, delete existing harnessX/ before scaffolding (destructive). */
  overwrite?: boolean;
}

function agentDebugLog(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
  runId?: string;
}) {
  // #region agent log
  const body = {
    sessionId: "57a8bf",
    runId: payload.runId ?? "pre-fix",
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data,
    timestamp: Date.now()
  };
  try {
    fs.appendFileSync(
      "/Users/zhangjr/apps/LlmDemo/hx-project/hx-lite/.cursor/debug-57a8bf.log",
      `${JSON.stringify(body)}\n`
    );
  } catch {
    /* ignore */
  }
  fetch("http://127.0.0.1:7307/ingest/88fb5b33-114f-42c3-b178-e43e3a7b2920", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "57a8bf" },
    body: JSON.stringify(body)
  }).catch(() => {});
  // #endregion
}

const NEXT_STEPS_EN = [
  "1. Edit harnessX/constitution.md — write your project principles and core domains",
  "2. Create your first change:  hx change create <name> --domains <d1,d2>",
  "3. Draft the proposal:        hx propose <name> --title \"...\"",
  "4. Validate as you go:        hx gate check <name>",
  "5. Install enforcement:       hx hooks install && hx ci init"
];

const NEXT_STEPS_ZH = [
  "1. 编辑 harnessX/constitution.md — 填写项目原则与核心域",
  "2. 创建首个 change：           hx change create <name> --domains <d1,d2>",
  "3. 起草提案：                  hx propose <name> --title \"...\"",
  "4. 随时校验：                  hx gate check <name>",
  "5. 安装强制机制：              hx hooks install && hx ci init"
];

const NEXT_STEPS_PROJECT_EN = [
  "1. Edit harnessX/constitution.md — write your project principles",
  "2. Commit & push harnessX/ to the project GitHub so teammates can pull",
  "3. Teammates: git pull (first time), then hx init --stages <stage,...>",
  "4. Asset updates later:       hx project pull-assets && hx adapter sync",
  "5. Owner hub upgrades:        hx project sync-hub  (then commit/push project GitHub)",
  "6. Install enforcement:       hx hooks install && hx ci init"
];

const NEXT_STEPS_PROJECT_ZH = [
  "1. 编辑 harnessX/constitution.md — 填写项目原则",
  "2. 将 harnessX/ 提交并推送到项目 GitHub，供成员 pull",
  "3. 成员首次：git pull 后执行  hx init --stages <stage,...>",
  "4. 资产更新：                 hx project pull-assets && hx adapter sync",
  "5. Owner 同步组织 Hub：       hx project sync-hub（再 commit/push 项目 GitHub）",
  "6. 安装强制机制：             hx hooks install && hx ci init"
];

function resolveScaffoldDir(scaffoldRoot: string, locale?: string): string {
  if (locale === "hx-cn") {
    const cn = path.join(scaffoldRoot, "hx-cn");
    if (!fs.existsSync(cn)) throw new Error(`unknown locale scaffold: ${locale}`);
    return cn;
  }
  return path.join(scaffoldRoot, "base");
}

export interface InitResult {
  ws: Workspace;
  created: string[];
  nextSteps: string[];
}

/** `hx init` — scaffolds harnessX/ (no hub). Optionally sets active_stages. */
export function initWorkspace(root: string, opts: InitOptions = {}): InitResult {
  const scaffoldRoot = opts.scaffoldDir ?? BUILTIN_SCAFFOLD_DIR;
  const ws = new Workspace(root);
  const harnessExists = fs.existsSync(ws.harnessFile);
  const changesExist = fs.existsSync(ws.changesDir);
  let changeCount = 0;
  try {
    if (changesExist) changeCount = fs.readdirSync(ws.changesDir).filter((n) => !n.startsWith(".")).length;
  } catch {
    /* ignore */
  }
  agentDebugLog({
    hypothesisId: "A",
    location: "init.ts:initWorkspace",
    message: "initWorkspace entry — harness existence check",
    runId: opts.overwrite ? "post-fix" : "pre-fix",
    data: {
      root,
      base: ws.base,
      harnessFile: ws.harnessFile,
      harnessExists,
      changesExist,
      changeCount,
      overwrite: opts.overwrite === true
    }
  });
  if (harnessExists) {
    if (!opts.overwrite) {
      throw new Error(
        `harnessX already initialized at ${ws.base} — pass --overwrite to replace, or use hx project sync-hub / hx project pull-assets`
      );
    }
    agentDebugLog({
      hypothesisId: "A",
      location: "init.ts:initWorkspace:overwrite",
      message: "removing existing harnessX for overwrite",
      runId: "post-fix",
      data: { base: ws.base, changeCount }
    });
    fs.rmSync(ws.base, { recursive: true, force: true });
  }

  const baseDir = resolveScaffoldDir(scaffoldRoot, opts.locale);
  ensureDir(ws.base);
  for (const f of ["constitution.md", "config.yaml", "harness.yaml"]) {
    fs.copyFileSync(path.join(baseDir, f), path.join(ws.base, f));
  }
  copyDir(path.join(baseDir, "assets"), ws.assetsDir);
  for (const dir of [ws.specsDir, ws.changesDir, ws.archiveDir, ws.runsDir, ws.workordersDir(), ws.changeRequestsDir()]) ensureDir(dir);
  scaffoldRoles(ws);

  const created = [
    "constitution.md",
    "config.yaml",
    "harness.yaml",
    "roles.yaml",
    "workorders/",
    "change-requests/",
    "assets/",
    "specs/",
    "changes/",
    "archive/",
    "runs/"
  ];

  const config = ws.readConfig();
  const profile = opts.profile ?? config.profile ?? "standard";
  let activeStages = opts.stages;
  if (activeStages?.length) {
    activeStages = validateActiveStages(profile, activeStages);
  }
  writeYaml(ws.configFile, {
    ...config,
    profile,
    ...(activeStages ? { active_stages: activeStages } : {}),
    ...(opts.locale === "hx-cn" ? { locale: "zh-CN" } : {})
  });

  validateScaffoldCompleteness(ws, { profile });

  const nextSteps = opts.locale === "hx-cn" ? NEXT_STEPS_ZH : NEXT_STEPS_EN;
  return { ws, created, nextSteps };
}

export interface ProjectCreateOptions {
  profile: string;
  hubRoot: string;
  locale?: string;
  scaffoldDir?: string;
  adapter?: string;
  actor?: string;
  /** Owner may set default active stages (defaults to all profile stages). */
  stages?: DeliveryStage[];
  /** When true, replace an existing harnessX/ (destructive). */
  overwrite?: boolean;
}

export interface ProjectCreateResult extends InitResult {
  resolution: ProfileAssetResolution;
}

/**
 * Owner path: scaffold + pull all hub assets for the profile's stages/tasks into the project repo.
 */
export function createProject(root: string, opts: ProjectCreateOptions): ProjectCreateResult {
  if (!DEFAULT_PROFILE_STAGES[opts.profile]) {
    throw new Error(`unknown profile "${opts.profile}" — expected lite|standard|strict|enterprise`);
  }

  {
    const probe = new Workspace(root);
    agentDebugLog({
      hypothesisId: "B",
      location: "init.ts:createProject",
      message: "createProject entry — overwrite option presence",
      runId: opts.overwrite ? "post-fix" : "pre-fix",
      data: {
        root,
        profile: opts.profile,
        hasOverwriteOpt: "overwrite" in opts,
        overwrite: opts.overwrite === true,
        harnessExists: fs.existsSync(probe.harnessFile),
        cwd: process.cwd()
      }
    });
  }

  const hubRoot = resolveHubSource(root, opts.hubRoot, { updateRemote: true });
  const res = initWorkspace(root, {
    locale: opts.locale,
    scaffoldDir: opts.scaffoldDir,
    profile: opts.profile,
    stages: opts.stages ?? [...DEFAULT_PROFILE_STAGES[opts.profile].stages],
    overwrite: opts.overwrite
  });

  const config = res.ws.readConfig();
  const hubSource = isGitHubHubRef(opts.hubRoot) ? opts.hubRoot : path.resolve(opts.hubRoot);
  writeYaml(res.ws.configFile, {
    ...config,
    profile: opts.profile,
    active_stages: opts.stages ?? [...DEFAULT_PROFILE_STAGES[opts.profile].stages],
    hub: {
      source: hubSource,
      role: "consumer",
      ...(opts.actor ? { actor: opts.actor } : {})
    },
    ...(opts.adapter ? { adapter: { target: opts.adapter } } : {})
  });

  const applied = applyProfileAssets(res.ws, hubRoot, opts.profile);
  writeLock(res.ws);
  res.created.push(...applied.installed.map((d) => `asset ${d}`));
  res.nextSteps = opts.locale === "hx-cn" ? NEXT_STEPS_PROJECT_ZH : NEXT_STEPS_PROJECT_EN;

  const resolution = resolveProfileAssets(hubRoot, opts.profile, res.ws);
  resolution.assets = applied.assets;

  return { ...res, resolution };
}

/**
 * Local path on an already-initialized project: set active_stages (multi-select).
 * Does not re-scaffold; fails if harnessX is missing.
 */
export function localInit(root: string, opts: { stages: DeliveryStage[] }): InitResult {
  const ws = new Workspace(root);
  if (!fs.existsSync(ws.harnessFile)) {
    throw new Error(`harnessX not found — clone/pull the project repo first, or run hx project create`);
  }
  const config = ws.readConfig();
  const stages = validateActiveStages(config.profile, opts.stages);
  writeYaml(ws.configFile, { ...config, active_stages: stages });
  return {
    ws,
    created: [`active_stages=${stages.join(",")}`],
    nextSteps: [
      "1. hx adapter sync",
      "2. Work only within your active stages",
      "3. hx gate check <change> --stage <s> --task <t>"
    ]
  };
}

/** @deprecated compatibility alias */
export const BUILTIN_BUNDLES_DIR = BUILTIN_SCAFFOLD_DIR;
