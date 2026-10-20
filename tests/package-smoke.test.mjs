import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "scripts/verify-standalone-package.mjs");
const version = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
).version;
const tarballName = `agentci-guard-${version}.tgz`;

function fixture(full = false) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentci-package-test-"),
  );
  const bin = path.join(directory, "bin");
  const calls = path.join(directory, "calls.jsonl");
  fs.mkdirSync(bin);
  fs.symlinkSync(process.execPath, path.join(bin, "node"));
  fs.writeFileSync(
    path.join(bin, "npm"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PACKAGE_TEST_CALLS, JSON.stringify(args) + "\\n");
if (process.env.PACKAGE_TEST_FULL !== "true") {
  console.error("instrumented npm pack boundary");
  process.exit(71);
}
if (args[0] === "pack") {
  const result = spawnSync(process.env.PACKAGE_TEST_NPM, [...args, "--offline"], {
    encoding: "utf8", env: { ...process.env, npm_config_ignore_scripts: "true" },
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
}
if (args[0] !== "install") throw new Error("Unexpected npm test command");
// Simulate only the bin link; no dependency install or lifecycle scripts.
const prefix = args[args.indexOf("--prefix") + 1];
const cli = path.join(path.dirname(args.at(-1)), "package/dist/cli.js");
fs.mkdirSync(path.join(prefix, "bin"), { recursive: true });
fs.chmodSync(cli, 0o755);
fs.symlinkSync(cli, path.join(prefix, "bin/agentci"));
if (process.env.PACKAGE_TEST_RACE_RECORD)
  fs.writeFileSync(process.env.PACKAGE_TEST_RACE_RECORD, "concurrent receipt");
`,
    { mode: 0o755 },
  );
  return {
    directory,
    run(args, environment = {}) {
      const result = spawnSync(process.execPath, [script, ...args], {
        cwd: directory,
        encoding: "utf8",
        timeout: 30_000,
        env: {
          ...process.env,
          INPUT_JSON: "",
          GITHUB_OUTPUT: "",
          GITHUB_STEP_SUMMARY: "",
          ...environment,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          PACKAGE_TEST_CALLS: calls,
          PACKAGE_TEST_FULL: String(full),
          PACKAGE_TEST_NPM: path.join(path.dirname(process.execPath), "npm"),
        },
      });
      expect(result.error).toBeUndefined();
      return {
        ...result,
        calls: fs.existsSync(calls)
          ? fs
              .readFileSync(calls, "utf8")
              .trim()
              .split("\n")
              .map((line) => JSON.parse(line))
          : [],
      };
    },
  };
}

describe("standalone package smoke arguments", () => {
  it.each([
    ["--record"],
    ["--record", ""],
    ["--record", "   "],
    ["--record", "--other"],
    ["--recrod", "record.json"],
    ["--record", "a.json", "--record", "b.json"],
    ["--record", "a.json", "extra"],
  ])("rejects malformed arguments %j before packing", (...args) => {
    const f = fixture();
    try {
      const result = f.run(args);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/usage/i);
      expect(result.calls).toEqual([]);
    } finally {
      fs.rmSync(f.directory, { recursive: true, force: true });
    }
  });

  it.each([[], ["--record", "中文 record.json"]])(
    "retains the documented invocation %j",
    (...args) => {
      const f = fixture();
      try {
        const result = f.run(args);
        expect(result.stderr).toContain("instrumented npm pack boundary");
        expect(result.calls).toHaveLength(1);
        expect(result.calls[0][0]).toBe("pack");
      } finally {
        fs.rmSync(f.directory, { recursive: true, force: true });
      }
    },
  );
});

describe("standalone package evidence retention", () => {
  it.each(["file", "directory", "symlink", "dangling symlink"])(
    "rejects an existing receipt %s before packing",
    (kind) => {
      const f = fixture();
      try {
        const record = path.join(f.directory, "record.json");
        const target = path.join(f.directory, "keep.json");
        fs.writeFileSync(target, "keep receipt");
        if (kind === "directory") fs.mkdirSync(record);
        else if (kind.includes("symlink"))
          fs.symlinkSync(
            kind === "symlink" ? target : path.join(f.directory, "absent.json"),
            record,
          );
        else fs.writeFileSync(record, "keep record");
        const result = f.run(["--record", record]);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/refusing to overwrite/i);
        expect(result.calls).toEqual([]);
        expect(fs.readFileSync(target, "utf8")).toBe("keep receipt");
        if (kind === "file")
          expect(fs.readFileSync(record, "utf8")).toBe("keep record");
        else if (kind === "directory")
          expect(fs.statSync(record).isDirectory()).toBe(true);
        else expect(fs.lstatSync(record).isSymbolicLink()).toBe(true);
      } finally {
        fs.rmSync(f.directory, { recursive: true, force: true });
      }
    },
  );

  it.each([false, true])(
    "preserves an existing tarball (symlink=%s) without publishing a receipt",
    (symlink) => {
      const f = fixture(true);
      try {
        const record = path.join(f.directory, "record.json");
        const tarball = path.join(f.directory, tarballName);
        const target = path.join(f.directory, "keep.tgz");
        fs.writeFileSync(target, "keep tarball");
        if (symlink) fs.symlinkSync(target, tarball);
        else fs.writeFileSync(tarball, "keep tarball");
        const result = f.run(["--record", record]);
        expect(result.status, result.stderr).toBe(1);
        expect(fs.readFileSync(tarball, "utf8")).toBe("keep tarball");
        expect(fs.readFileSync(target, "utf8")).toBe("keep tarball");
        expect(fs.existsSync(record)).toBe(false);
      } finally {
        fs.rmSync(f.directory, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it("rejects a receipt named exactly like its retained tarball", () => {
    const f = fixture(true);
    try {
      const record = path.join(f.directory, tarballName);
      const result = f.run(["--record", record]);
      expect(result.status, result.stderr).toBe(1);
      expect(fs.existsSync(record)).toBe(false);
    } finally {
      fs.rmSync(f.directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("preserves a receipt created after preflight instead of overwriting it", () => {
    const f = fixture(true);
    try {
      const record = path.join(f.directory, "record.json");
      const result = f.run(["--record", record], {
        PACKAGE_TEST_RACE_RECORD: record,
      });
      expect(result.status, result.stderr).toBe(1);
      expect(fs.readFileSync(record, "utf8")).toBe("concurrent receipt");
    } finally {
      fs.rmSync(f.directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("retains a hash-matching actual offline tarball and a successful receipt", () => {
    const f = fixture(true);
    try {
      const recordPath = path.join(f.directory, "中文 record.json");
      const result = f.run(["--record", recordPath]);
      expect(result.status, result.stderr).toBe(0);
      const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
      const tarball = fs.readFileSync(path.join(f.directory, record.tarball));
      expect(record.sha256).toBe(
        createHash("sha256").update(tarball).digest("hex"),
      );
      expect(record.bytes).toBe(tarball.length);
      expect(record.packed_version).toBe(version);
      expect(record.checks.length).toBeGreaterThan(0);
      expect(record.checks.every((check) => check.ok === true)).toBe(true);
      expect(result.calls.map((args) => args[0])).toEqual(["pack", "install"]);
    } finally {
      fs.rmSync(f.directory, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("standalone package Action environment", () => {
  it("does not create the parent INPUT_JSON destination", () => {
    const f = fixture(true);
    try {
      const outer = path.join(f.directory, "parent.json");
      const result = f.run([], { INPUT_JSON: outer });
      expect(result.status, result.stderr).toBe(0);
      expect(fs.existsSync(outer)).toBe(false);
    } finally {
      fs.rmSync(f.directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("does not append to the parent summary or output files", () => {
    const f = fixture(true);
    try {
      const summary = path.join(f.directory, "parent-summary.md");
      const output = path.join(f.directory, "parent-output");
      fs.writeFileSync(summary, "keep summary");
      fs.writeFileSync(output, "keep outputs");
      const result = f.run([], {
        GITHUB_STEP_SUMMARY: summary,
        GITHUB_OUTPUT: output,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(fs.readFileSync(summary, "utf8")).toBe("keep summary");
      expect(fs.readFileSync(output, "utf8")).toBe("keep outputs");
    } finally {
      fs.rmSync(f.directory, { recursive: true, force: true });
    }
  }, 30_000);
});
