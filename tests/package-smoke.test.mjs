import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "scripts/verify-standalone-package.mjs");

function fixture() {
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
fs.appendFileSync(process.env.PACKAGE_TEST_CALLS, JSON.stringify(process.argv.slice(2)) + "\\n");
console.error("instrumented npm pack boundary");
process.exit(71);
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
          ...environment,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          PACKAGE_TEST_CALLS: calls,
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
