import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const assets = [
  "index.html",
  "styles.css",
  "app.js",
  "scanner-browser.js",
  "_headers",
  "THIRD_PARTY_LICENSES.txt",
];

export async function checkDeployReadiness({
  root: source = root,
  git = (...args) =>
    execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim(),
  build = () =>
    execFileSync("pnpm", ["site:check"], { cwd: source, stdio: "inherit" }),
  request = fetch,
} = {}) {
  assert.equal(
    git("status", "--porcelain"),
    "",
    "Source worktree must be clean",
  );
  const sha = git("rev-parse", "HEAD");
  assert.match(sha, /^[a-f0-9]{40}$/i, "HEAD must be a commit SHA");

  const response = await request(
    "https://api.github.com/repos/David-Wu1119/agentci-guard/git/ref/heads/main",
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "agentci-guard-site-preflight",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  assert.equal(response.status, 200, "Source must be published on public main");
  const ref = await response.json();
  assert.equal(ref?.object?.sha, sha, "HEAD must equal public main");

  await build();
  assert.equal(git("rev-parse", "HEAD"), sha, "HEAD changed during site build");
  assert.equal(
    git("status", "--porcelain"),
    "",
    "Source worktree must remain clean after build",
  );
  const manifest = JSON.parse(
    await fs.readFile(path.join(source, "site", "BUILD_MANIFEST.json"), "utf8"),
  );
  assert.deepEqual(
    Object.keys(manifest).sort(),
    [...assets].sort(),
    "Build manifest must contain exactly the six allowlisted assets",
  );
  for (const name of assets) {
    const bytes = await fs.readFile(path.join(source, "site", "dist", name));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      manifest[name],
      `${name} differs from the fresh build manifest`,
    );
  }
  return { sha, manifest };
}

// shortcut: no deployment lock exists; invoke Wrangler immediately after this check.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { sha } = await checkDeployReadiness();
  console.log(`PASS: site assets match clean public main commit ${sha}`);
}
