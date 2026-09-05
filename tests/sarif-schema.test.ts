import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanRepository } from "../src/index.js";
import { toSarif } from "../src/sarif.js";

describe("SARIF 2.1.0 schema", () => {
  it("accepts scanner output and rejects properties forbidden by OASIS", async () => {
    const temporary = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "agentci-sarif-schema-"),
    );
    const result = await scanRepository("examples/vulnerable");
    const validPath = path.join(temporary, "valid.sarif");
    const invalidPath = path.join(temporary, "invalid.sarif");
    const document = toSarif(result);
    await fs.promises.writeFile(
      validPath,
      `${JSON.stringify(document)}\n`,
      "utf8",
    );
    await fs.promises.writeFile(
      invalidPath,
      `${JSON.stringify({ ...document, unexpected: true })}\n`,
      "utf8",
    );

    const valid = verify(validPath);
    expect(valid.status).toBe(0);
    expect(valid.stdout).toContain("vendored OASIS SARIF 2.1.0");

    const invalid = verify(invalidPath);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain(
      "official SARIF 2.1.0 schema validation failed",
    );
  });
});

describe("SARIF 2.1.0 schema with an incomplete scan", () => {
  it("accepts invocations carrying warning and error notifications", async () => {
    const temporary = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "agentci-sarif-incomplete-"),
    );
    const workflows = path.join(temporary, ".github", "workflows");
    await fs.promises.mkdir(workflows, { recursive: true });
    await fs.promises.writeFile(
      path.join(workflows, "remote.yml"),
      "on: push\njobs:\n  d:\n    uses: example/shared/.github/workflows/ci.yml@v1\n",
      "utf8",
    );
    await fs.promises.writeFile(
      path.join(workflows, "broken.yml"),
      "on: [push\njobs:\n  x:\n    runs-on: ubuntu\n",
      "utf8",
    );
    const result = await scanRepository(temporary);
    const document = toSarif(result);
    const levels = new Set(
      document.runs[0].invocations?.[0]?.toolExecutionNotifications.map(
        (n) => n.level,
      ),
    );
    expect(levels).toEqual(new Set(["warning", "error"]));
    expect(document.runs[0].invocations?.[0]?.executionSuccessful).toBe(false);

    const file = path.join(temporary, "incomplete.sarif");
    await fs.promises.writeFile(file, `${JSON.stringify(document)}\n`, "utf8");
    const verified = verify(file);
    expect(verified.stderr).toBe("");
    expect(verified.status).toBe(0);
  });
});

function verify(file: string) {
  return spawnSync(
    process.execPath,
    ["scripts/verify-sarif-schema.mjs", file],
    {
      cwd: path.resolve("."),
      encoding: "utf8",
    },
  );
}
