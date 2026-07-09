#!/usr/bin/env node
/**
 * Move hub-golden packages from flat layout:
 *   packages/<id>/<version>/
 * to kind-scoped layout:
 *   packages/<kind-a>/<kind-b>/.../<id>/<version>/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = path.join(ROOT, "packages/hub-golden/packages");

function isVersionDir(name) {
  return /^\d+\.\d+\.\d+/.test(name);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) removeDir(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

function movePackage(id, version) {
  const src = path.join(PACKAGES, id, version);
  const assetFile = path.join(src, "asset.yaml");
  if (!fs.existsSync(assetFile)) return false;
  const manifest = YAML.parse(fs.readFileSync(assetFile, "utf8"));
  const kind = manifest?.kind;
  if (!kind || !kind.includes(".")) throw new Error(`invalid kind for ${id}@${version}: ${kind}`);
  const dest = path.join(PACKAGES, ...kind.split("."), id, version);
  if (path.resolve(src) === path.resolve(dest)) return false;
  if (fs.existsSync(dest)) {
    console.log(`skip existing ${id}@${version} -> ${path.relative(PACKAGES, dest)}`);
    return false;
  }
  copyDir(src, dest);
  removeDir(src);
  console.log(`moved ${id}@${version} -> ${path.relative(PACKAGES, dest)}`);
  return true;
}

let moved = 0;
for (const entry of fs.readdirSync(PACKAGES, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const id = entry.name;
  const idPath = path.join(PACKAGES, id);
  const versions = fs.readdirSync(idPath, { withFileTypes: true }).filter((d) => d.isDirectory() && isVersionDir(d.name));
  if (versions.length === 0) continue;
  for (const ver of versions) {
    if (movePackage(id, ver.name)) moved++;
  }
  const remaining = fs.readdirSync(idPath);
  if (remaining.length === 0) fs.rmdirSync(idPath);
}

console.log(`done (${moved} package(s) moved)`);
