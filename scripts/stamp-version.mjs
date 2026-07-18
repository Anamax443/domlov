// Zapíše aktuální commit/branch/čas do src/version.json (čte ho /api/version).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const git = (cmd, def) => {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return def;
  }
};

const commit = git("git rev-parse --short HEAD", "dev");
const branch = git("git rev-parse --abbrev-ref HEAD", "main");
const builtAt = new Date().toISOString();

const out = fileURLToPath(new URL("../src/version.json", import.meta.url));
writeFileSync(out, JSON.stringify({ commit, branch, builtAt }, null, 2) + "\n");
console.log(`stamped version.json → ${commit} (${branch}) @ ${builtAt}`);
