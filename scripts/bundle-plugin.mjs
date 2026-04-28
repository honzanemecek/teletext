#!/usr/bin/env node
// Bundle the MCP server and CLI from the workspace packages into self-contained
// ESM files under plugin/dist/. The Claude Code plugin ships these so installs
// remain offline-friendly (no npm fetch on first run).

import { build } from "esbuild";
import { mkdir, chmod, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const outDir = resolve(repoRoot, "plugin", "dist");

const targets = [
  {
    name: "server",
    entry: resolve(repoRoot, "packages/mcp/src/server.ts"),
    out: resolve(outDir, "server.js"),
  },
  {
    name: "cli",
    entry: resolve(repoRoot, "packages/cli/src/cli.ts"),
    out: resolve(outDir, "cli.js"),
  },
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const t of targets) {
  await build({
    entryPoints: [t.entry],
    outfile: t.out,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    sourcemap: false,
    minify: false,
    legalComments: "none",
    logLevel: "info",
  });
  await chmod(t.out, 0o755);
  process.stdout.write(`bundled ${t.name} → ${t.out}\n`);
}
