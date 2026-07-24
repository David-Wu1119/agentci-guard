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
    const document = toSarif(result.findings);
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
