import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve(
  import.meta.dirname,
  "../scripts/audit-dependencies.mjs",
);
const metadata = (high = 0) => ({
  metadata: {
    vulnerabilities: { info: 0, low: 1, moderate: 0, high, critical: 0 },
  },
});

function run(cases, args = []) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentci-audit-command-"),
  );
  const callsPath = path.join(directory, "calls.jsonl");
  try {
    fs.symlinkSync(process.execPath, path.join(directory, "node"));
    if (!cases[0].missing)
      fs.writeFileSync(
        path.join(directory, "pnpm"),
        `#!/usr/bin/env node
const fs = require("node:fs");
const callsPath = process.env.AUDIT_TEST_CALLS;
const calls = fs.existsSync(callsPath) ? fs.readFileSync(callsPath, "utf8").trim().split("\\n").length : 0;
fs.appendFileSync(callsPath, JSON.stringify(process.argv.slice(2)) + "\\n");
if (!process.argv.includes("--json")) { console.log("Synthetic advisory table"); process.exit(1); }
const cases = JSON.parse(process.env.AUDIT_TEST_CASES);
const item = cases[Math.min(calls, cases.length - 1)];
const finish = () => {
  process.stdout.write(item.raw ?? JSON.stringify(item.output));
  if (item.signal) process.kill(process.pid, item.signal);
  else process.exit(item.status ?? 0);
};
if (item.delay) {
  process.stdout.write(item.raw ?? JSON.stringify(item.output));
  setTimeout(() => process.exit(item.status ?? 0), item.delay);
} else finish();
`,
        { mode: 0o755 },
      );
    const result = spawnSync(
      process.execPath,
      [script, "--attempts", "3", "--wait", "0", ...args],
      {
        encoding: "utf8",
        timeout: 5000,
        env: {
          ...process.env,
          PATH: directory,
          AUDIT_TEST_CALLS: callsPath,
          AUDIT_TEST_CASES: JSON.stringify(cases),
        },
      },
    );
    expect(result.error).toBeUndefined();
    return {
      ...result,
      calls: fs.existsSync(callsPath)
        ? fs
            .readFileSync(callsPath, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [],
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe("dependency audit command", () => {
  it("fails immediately if pnpm cannot be launched", () => {
    const result = run([{ missing: true }]);
    expect(result.status).toBe(1);
    expect(result.calls).toHaveLength(0);
    expect(result.stderr).toContain("ENOENT");
  });
  it("accepts validated below-threshold counts even when pnpm exits 1", () => {
    const result = run([{ output: metadata(), status: 1 }]);
    expect(result.status).toBe(0);
    expect(result.calls).toEqual([["audit", "--audit-level=high", "--json"]]);
  });

  it("fails high advisories immediately and prints the best-effort table", () => {
    const result = run([{ output: metadata(1), status: 1 }]);
    expect(result.status).toBe(1);
    expect(result.calls).toHaveLength(2);
    expect(result.calls[1]).not.toContain("--json");
  });

  it("retries an unreachable endpoint, accepts recovery and fails sustained outage", () => {
    const outage = { output: { error: { message: "ECONNRESET" } }, status: 1 };
    const recovered = run([outage, { output: metadata() }]);
    expect(recovered.status).toBe(0);
    expect(recovered.calls).toHaveLength(2);
    const sustained = run([outage]);
    expect(sustained.status).toBe(1);
    expect(sustained.calls).toHaveLength(3);
  });

  it("fails malformed metadata without retrying it as a transport outage", () => {
    const result = run([{ output: { metadata: {} } }]);
    expect(result.status).toBe(1);
    expect(result.calls).toHaveLength(1);
  });

  it.each([
    ["--level", "typo"],
    ["--levle", "high"],
    ["--attempts", "0"],
    ["--attempts", "1.5"],
    ["--attempts", "Infinity"],
    ["--wait", "-1"],
    ["--wait", "Infinity"],
    ["--timeout", "0"],
    ["--timeout", "NaN"],
    ["--level"],
  ])("rejects invalid arguments %j before launching pnpm", (...args) => {
    const result = run([{ output: metadata() }], args);
    expect(result.status).toBe(1);
    expect(result.calls).toHaveLength(0);
    expect(result.stderr).toMatch(/invalid|usage/i);
  });

  it.each([{ status: 2 }, { signal: "SIGTERM" }])(
    "never passes clean JSON from a failed process: %j",
    (failure) => {
      const result = run([{ output: metadata(), ...failure }]);
      expect(result.status).toBe(1);
      expect(result.calls).toHaveLength(1);
    },
  );

  it("retries a killed timeout but never treats its partial JSON as clean", () => {
    const result = run(
      [{ output: metadata(), delay: 500 }],
      ["--timeout", "0.1"],
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("attempt 3/3");
    expect(result.stdout).not.toContain("audit clean");
  });
});
