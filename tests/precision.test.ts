import { describe, expect, it } from "vitest";
import { scanRepository } from "../src/index.js";

describe("precision", () => {
  it("produces zero findings on ordinary CI (no AI agent present)", async () => {
    const result = await scanRepository("tests/fixtures/benign");

    expect(result.workflow_count).toBeGreaterThanOrEqual(3);
    // A self-hosted "build-agent" runner, a "datadog/agent-action", and a
    // "User-Agent" header must NOT be mistaken for AI-agent usage.
    expect(result.findings).toEqual([]);
  });

  it("still detects real agent usage in the known-vulnerable fixture", async () => {
    const result = await scanRepository("tests/fixtures");
    const rules = new Set(result.findings.map((finding) => finding.rule_id));

    expect(rules.has("agentci/untrusted-ai-write-token")).toBe(true);
    expect(rules.has("agentci/pull-request-target-ai")).toBe(true);
    expect(rules.has("agentci/ai-with-secrets")).toBe(true);
  });
});
