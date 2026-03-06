#!/usr/bin/env node
/**
 * Build all Dockerfile.* in server/docker.
 * Tag: Dockerfile.<name> → <name>-workspace:latest
 * Run from server/: npm run docker:build
 */
import { readdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const dockerDir = join(process.cwd(), "docker");
const files = readdirSync(dockerDir);
const dockerfiles = files.filter((f) => /^Dockerfile\.(.+)$/.test(f));

if (dockerfiles.length === 0) {
  console.warn("No Dockerfile.* found in server/docker");
  process.exit(0);
}

for (const file of dockerfiles) {
  const name = file.replace(/^Dockerfile\./, "");
  const tag = `${name}-workspace:latest`;
  const cmd = `docker build -f docker/${file} -t ${tag} .`;
  console.log(`[docker:build] Building ${file} → ${tag}...`);
  execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
}
console.log("[docker:build] Done.");
