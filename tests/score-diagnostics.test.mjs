import { describe, expect, it } from "vitest";
import {
  predict,
  relevantDiagnostics,
} from "../scripts/benchmark/scoring-unit.mjs";

const file = ".github/workflows/agent.yml";
const annotation = (rule_id) => ({
  workflow_file: file,
  job_id: "agent",
  scope: "job",
  rule_id,
});
const diagnostic = (code) => ({ code, file, job: "agent" });
const result = (findings = [], diagnostics = []) => ({
  findings,
  diagnostics,
  agent_usages: [],
});
const classify = (rule, scan) =>
  predict(annotation(rule), scan, "agentci/agent-usage");

describe("score diagnostic attribution", () => {
  it("abstains only on the two write-token rules when implicit ingestion is unverified", () => {
    const scan = result(
      [],
      [diagnostic("agentci/analysis-agent-implicit-ingestion-unknown")],
    );
    expect(classify("agentci/untrusted-ai-write-token", scan)).toBe("unknown");
    expect(classify("agentci/gated-ai-write-token", scan)).toBe("unknown");
    expect(classify("agentci/agent-usage", scan)).toBe("negative");
    expect(classify("agentci/broad-write-permissions", scan)).toBe("negative");
  });

  it("keeps a proven critical path positive and the mutually exclusive gated rule negative", () => {
    const scan = result(
      [{ rule_id: "agentci/untrusted-ai-write-token", file, job: "agent" }],
      [diagnostic("agentci/analysis-agent-implicit-ingestion-unknown")],
    );
    expect(classify("agentci/untrusted-ai-write-token", scan)).toBe("positive");
    expect(classify("agentci/gated-ai-write-token", scan)).toBe("negative");
  });

  it("does not rule out a critical path when gated evidence coexists with unknown ingestion", () => {
    const scan = result(
      [{ rule_id: "agentci/gated-ai-write-token", file, job: "agent" }],
      [diagnostic("agentci/analysis-agent-implicit-ingestion-unknown")],
    );
    expect(classify("agentci/gated-ai-write-token", scan)).toBe("positive");
    expect(classify("agentci/untrusted-ai-write-token", scan)).toBe("unknown");
  });

  it("does not treat known unsupported Action paths as scoring abstentions", () => {
    const scan = result(
      [],
      [diagnostic("agentci/analysis-agent-event-unsupported")],
    );
    expect(classify("agentci/agent-usage", scan)).toBe("negative");
    expect(classify("agentci/untrusted-ai-write-token", scan)).toBe("negative");
    expect(
      relevantDiagnostics(annotation("agentci/unsafe-checkout"), scan),
    ).toEqual([]);
  });

  it("attributes unknown permissions to both write-token rules and broad-write", () => {
    const scan = result(
      [],
      [diagnostic("agentci/analysis-permissions-unknown")],
    );
    for (const rule of [
      "agentci/untrusted-ai-write-token",
      "agentci/gated-ai-write-token",
      "agentci/broad-write-permissions",
    ]) {
      expect(classify(rule, scan)).toBe("unknown");
    }
    expect(classify("agentci/untrusted-input-in-prompt", scan)).toBe(
      "negative",
    );
  });
});
