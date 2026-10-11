import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

describe("pilot packet contract", () => {
  it("exports the exact v0.1.1 eight-rule instructions for its frozen units", () => {
    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), "agentci-pilot-contract-"),
    );
    try {
      const packet = path.join(temporary, "packet");
      execFileSync(
        process.execPath,
        [
          path.join(
            repositoryRoot,
            "scripts/benchmark/export-pilot-packet.mjs",
          ),
          packet,
        ],
        { cwd: repositoryRoot, stdio: "pipe" },
      );
      const rules = fs.readFileSync(path.join(packet, "RULES.md"));
      const analysisModel = fs.readFileSync(
        path.join(packet, "analysis-model.md"),
      );
      expect(sha256(rules)).toBe(
        "267ce5d223f79161b6e98772916e1bc0eb210b54393ca71f767d2a0fada73bc5",
      );
      expect(sha256(analysisModel)).toBe(
        "695e8250bce60b3820810257f30aa0b21f9883a0eccf1bbc8ecad977010cb898",
      );
      const frozenRegistry = JSON.parse(
        fs.readFileSync(
          path.join(repositoryRoot, "benchmark/manifest.json"),
          "utf8",
        ),
      );
      const ruleIds = [
        ...rules.toString().matchAll(/^\| `(agentci\/[^`]+)`\s+\|/gm),
      ].map((match) => match[1]);
      expect(ruleIds).toEqual(frozenRegistry.rules);
      expect(ruleIds).toHaveLength(8);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
});

function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}
