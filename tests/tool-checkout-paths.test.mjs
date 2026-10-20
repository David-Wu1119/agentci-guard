import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

describe("top-level tool checkout paths", () => {
  it("keeps render-check outputs in the real relocated site directory", () => {
    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), "agentci-render-path-"),
    );
    try {
      const site = path.join(
        fs.realpathSync(temporary),
        "中文 repo%20%2F#check",
        "site",
      );
      fs.mkdirSync(site, { recursive: true });
      const source = fs.readFileSync(
        path.join(repositoryRoot, "site/render-check.mjs"),
        "utf8",
      );
      const manifestStart = source.indexOf("const manifest =");
      expect(manifestStart).toBeGreaterThan(0);
      // Exercise the actual root initialization without starting Chrome or CDP.
      const probe = path.join(site, "render-path-probe.mjs");
      fs.writeFileSync(
        probe,
        source.slice(0, manifestStart) +
          '\nawait fs.mkdir(root + "screenshots", { recursive: true });\n' +
          'await fs.writeFile(root + "screenshots/desktop.png", "synthetic image");\n' +
          'await fs.writeFile(root + "VISUAL_CHECKS.json", "{}\\n");\n',
      );
      const result = spawnSync(process.execPath, [probe], {
        cwd: temporary,
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(fs.existsSync(path.join(site, "VISUAL_CHECKS.json"))).toBe(true);
      expect(
        fs.readFileSync(path.join(site, "screenshots/desktop.png"), "utf8"),
      ).toBe("synthetic image");
      expect(fs.readdirSync(temporary)).toEqual(["中文 repo%20%2F#check"]);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });

  it.each([
    "generate-third-party-licenses.mjs",
    "verify-action-manifest.mjs",
    "verify-baseline.mjs",
    "verify-standalone-package.mjs",
  ])("resolves the real checkout for %s", (name) => {
    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), "agentci-tool-path-"),
    );
    try {
      const root = path.join(
        fs.realpathSync(temporary),
        "中文 repo%20%2F#check",
      );
      const scripts = path.join(root, "scripts");
      const bin = path.join(temporary, "bin");
      const calledFrom = path.join(temporary, "called-from");
      fs.mkdirSync(scripts, { recursive: true });
      fs.mkdirSync(bin);
      fs.copyFileSync(
        path.join(repositoryRoot, "scripts", name),
        path.join(scripts, name),
      );
      for (const file of [
        "package.json",
        "action.yml",
        "studies/v0.1.0-baseline",
      ])
        fs.cpSync(path.join(repositoryRoot, file), path.join(root, file), {
          recursive: true,
        });
      fs.mkdirSync(path.join(root, "dist"));
      fs.writeFileSync(
        path.join(root, "dist/action.js"),
        "// Synthetic self-contained bundle.\n",
      );
      fs.mkdirSync(path.join(root, "node_modules"));
      fs.symlinkSync(
        path.join(repositoryRoot, "node_modules/yaml"),
        path.join(root, "node_modules/yaml"),
        "dir",
      );

      // Keep this root regression offline: package installation is not under test.
      for (const [command, response] of [
        ["pnpm", 'console.log("{}");'],
        [
          "npm",
          'console.error("synthetic pack boundary reached"); process.exit(71);',
        ],
      ]) {
        fs.writeFileSync(
          path.join(bin, command),
          `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(process.env.TOOL_TEST_CWD, process.cwd());
${response}
`,
          { mode: 0o755 },
        );
      }
      const result = spawnSync(
        process.execPath,
        [
          path.join(scripts, name),
          ...(name === "generate-third-party-licenses.mjs" ? ["--write"] : []),
        ],
        {
          cwd: temporary,
          encoding: "utf8",
          timeout: 10_000,
          env: {
            ...process.env,
            PATH: `${bin}${path.delimiter}${process.env.PATH}`,
            TOOL_TEST_CWD: calledFrom,
            GIT_DIR: execFileSync("git", ["rev-parse", "--absolute-git-dir"], {
              cwd: repositoryRoot,
              encoding: "utf8",
            }).trim(),
          },
        },
      );
      expect(result.error).toBeUndefined();
      if (name === "verify-standalone-package.mjs") {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("synthetic pack boundary reached");
      } else {
        expect(result.status, result.stderr).toBe(0);
      }
      if (
        name === "verify-standalone-package.mjs" ||
        name === "generate-third-party-licenses.mjs"
      )
        expect(fs.readFileSync(calledFrom, "utf8")).toBe(root);
      if (name === "generate-third-party-licenses.mjs")
        expect(
          fs.readFileSync(path.join(root, "THIRD_PARTY_LICENSES.md"), "utf8"),
        ).toContain("# Third-Party Runtime Licenses");
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
});
