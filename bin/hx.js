#!/usr/bin/env node
// hx launcher: runs the TypeScript CLI via tsx with the repo tsconfig, from any cwd.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tsx = path.join(root, "node_modules", ".bin", "tsx");
const result = spawnSync(
  tsx,
  [
    "--tsconfig",
    path.join(root, "tsconfig.json"),
    path.join(root, "packages", "cli", "src", "index.ts"),
    ...process.argv.slice(2)
  ],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
