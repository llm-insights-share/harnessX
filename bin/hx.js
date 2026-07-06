#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const built = path.join(root, "dist", "cli.mjs");

if (fs.existsSync(built)) {
  await import(pathToFileURL(built).href);
} else {
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
}
