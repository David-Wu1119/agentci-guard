import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isInvokedAsScript } from "../src/cli.js";
import packageJson from "../package.json" with { type: "json" };

// At v0.5.0 the CLI decided whether it was the main script by comparing
// import.meta.url (which Node resolves through symlinks) with process.argv[1]
// (which it does not). Through any symlink -- npm's global bin entry, macOS
// /tmp -- the CLI loaded, did nothing, and exited 0.
describe("isInvokedAsScript", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentci-entry-"));
  const real = path.join(dir, "real", "cli.js");
  fs.mkdirSync(path.dirname(real));
  fs.writeFileSync(real, "", "utf8");
  const link = path.join(dir, "link.js");
  fs.symlinkSync(real, link);
  const realUrl = pathToFileURL(fs.realpathSync(real)).href;

  it("matches when argv[1] is the real path", () => {
    expect(isInvokedAsScript(realUrl, real)).toBe(true);
  });

  it("matches when argv[1] is a symlink to the module", () => {
    expect(isInvokedAsScript(realUrl, link)).toBe(true);
  });

  it("matches a relative argv[1] resolved against the working directory", () => {
    expect(isInvokedAsScript(realUrl, path.relative(process.cwd(), real))).toBe(
      true,
    );
  });

  it("does not match a different file or a missing argv[1]", () => {
    const other = path.join(dir, "other.js");
    fs.writeFileSync(other, "", "utf8");
    expect(isInvokedAsScript(realUrl, other)).toBe(false);
    expect(isInvokedAsScript(realUrl, undefined)).toBe(false);
  });

  it("still matches when argv[1] does not exist on disk (plain comparison)", () => {
    const ghost = path.join(dir, "ghost.js");
    expect(isInvokedAsScript(pathToFileURL(ghost).href, ghost)).toBe(true);
  });
});

describe("committed dist/cli.js through a symlink", () => {
  it("runs and reports the package version", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentci-dist-link-"));
    const link = path.join(dir, "agentci");
    fs.symlinkSync(path.resolve("dist/cli.js"), link);
    const result = spawnSync(process.execPath, [link, "--version"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });
});
