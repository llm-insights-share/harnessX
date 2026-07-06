import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(root, "dist");

function pkgAliasPlugin(pkg, srcDir) {
  const prefix = `@harnessx/${pkg}`;
  return {
    name: `alias-${pkg}`,
    setup(build) {
      build.onResolve({ filter: new RegExp(`^${prefix}(/.*)?$`) }, (args) => {
        let sub = args.path.slice(prefix.length);
        if (sub.startsWith("/")) sub = sub.slice(1);
        if (!sub || sub === "index.js") sub = "index.ts";
        else sub = sub.replace(/\.js$/, ".ts");
        return { path: path.join(srcDir, sub) };
      });
    }
  };
}

fs.mkdirSync(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, "packages/cli/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: path.join(distDir, "cli.mjs"),
  external: ["commander", "yaml", "zod"],
  plugins: [
    pkgAliasPlugin("core", path.join(root, "packages/core/src")),
    pkgAliasPlugin("sensors", path.join(root, "packages/sensors/src")),
    pkgAliasPlugin("adapters", path.join(root, "packages/adapters/src"))
  ],
  logLevel: "info"
});

console.log("built dist/cli.mjs");
