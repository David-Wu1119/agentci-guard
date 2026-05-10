import { describe, expect, it } from "vitest";
import { scanRepository, toSarif } from "../src/index.js";

describe("scanRepository", () => {
  it("detects unsafe AI-agent workflow patterns", async () => {
    const result = await scanRepository("tests/fixtures");
    const rules = new Set(result.findings.map((finding) => finding.rule_id));

    expect(result.workflow_count).toBe(2);
    expect(rules).toContain("agentci/pull-request-target-ai");
    expect(rules).toContain("agentci/untrusted-ai-write-token");
    expect(rules).toContain("agentci/ai-with-secrets");
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/ai-shell-access");
    expect(rules).toContain("agentci/unsafe-checkout");
    expect(result.summary.critical).toBeGreaterThanOrEqual(2);
  });

  it("emits valid SARIF shape", async () => {
    const result = await scanRepository("tests/fixtures");
    const sarif = toSarif(result.findings);

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]?.tool.driver.name).toBe("AgentCI Guard");
    expect(sarif.runs[0]?.results.length).toBe(result.findings.length);
  });
});
