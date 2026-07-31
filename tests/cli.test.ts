import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);

describe("agentci CLI", () => {
  it("creates parent directories for a SARIF output path", async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-cli-"));
    const sarif = path.join(temporary, "reports", "agentci-results.sarif");

    try {
      await execute(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli.ts",
          "scan",
          "tests/fixtures/benign",
          "--sarif",
          sarif,
          "--fail-on",
          "none",
        ],
        { cwd: process.cwd() },
      );

      expect(JSON.parse(await fs.readFile(sarif, "utf8"))).toMatchObject({
        version: "2.1.0",
      });
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  });

  it("creates parent directories for a Markdown output path", async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-cli-"));
    const markdown = path.join(temporary, "reports", "agentci-results.md");

    try {
      await execute(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli.ts",
          "scan",
          "tests/fixtures/benign",
          "--markdown",
          markdown,
          "--fail-on",
          "none",
        ],
        { cwd: process.cwd() },
      );

      expect(await fs.readFile(markdown, "utf8")).toContain(
        "# AgentCI Guard Scan",
      );
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  });
});
