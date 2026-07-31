import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkflowFiles, scanRepository } from "../src/index.js";
import { narrowEvents, normalizeTriggers } from "../src/workflow-model.js";
import type {
  AgentUsage,
  Diagnostic,
  Finding,
  Severity,
} from "../src/types.js";

type ExpectedLocation = {
  file: string;
  job?: string;
  step?: string;
  line_min: number;
};

type CorpusCase = {
  id: string;
  path: string;
  targets: string[];
  subject: {
    file: string;
    job?: string;
    step?: string;
  };
  expected: {
    reachable_events: string[];
    findings: Array<{
      rule_id: string;
      severity: Severity;
      location: ExpectedLocation;
    }>;
    diagnostics: Array<{
      code: string;
      severity: Diagnostic["severity"];
      location: Omit<ExpectedLocation, "step">;
    }>;
    agent_usages?: Array<{
      file: string;
      job: string;
      step: string;
      kind: AgentUsage["kind"];
      line_min: number;
      reachable_events: string[];
      call_chain?: string[];
    }>;
    analysis_complete: boolean;
  };
  rationale: string;
  assumption_sources: string[];
};

const corpusRoot = path.resolve("corpus/adversarial");
const manifest = JSON.parse(
  await fs.readFile(path.join(corpusRoot, "manifest.json"), "utf8"),
) as {
  schema_version: number;
  security_assumptions: Record<string, unknown>;
  cases: CorpusCase[];
};

function findingSignature(finding: Finding): string {
  return JSON.stringify([
    finding.rule_id,
    finding.severity,
    finding.file,
    finding.job ?? null,
    finding.step ?? null,
  ]);
}

function expectedFindingSignature(
  finding: CorpusCase["expected"]["findings"][number],
): string {
  return JSON.stringify([
    finding.rule_id,
    finding.severity,
    finding.location.file,
    finding.location.job ?? null,
    finding.location.step ?? null,
  ]);
}

function diagnosticSignature(diagnostic: Diagnostic): string {
  return JSON.stringify([
    diagnostic.code,
    diagnostic.severity,
    diagnostic.file,
    diagnostic.job ?? null,
  ]);
}

function expectedDiagnosticSignature(
  diagnostic: CorpusCase["expected"]["diagnostics"][number],
): string {
  return JSON.stringify([
    diagnostic.code,
    diagnostic.severity,
    diagnostic.location.file,
    diagnostic.location.job ?? null,
  ]);
}

function agentUsageSignature(
  usage:
    | AgentUsage
    | NonNullable<CorpusCase["expected"]["agent_usages"]>[number],
): string {
  return JSON.stringify([usage.file, usage.job, usage.step, usage.kind]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

describe("public adversarial corpus", () => {
  it("publishes reviewable labels and assumption sources", async () => {
    expect(manifest.schema_version).toBe(2);
    expect(Object.keys(manifest.security_assumptions).length).toBeGreaterThan(
      0,
    );
    for (const source of Object.values(manifest.security_assumptions)) {
      if (
        isRecord(source) &&
        source.type === "project" &&
        typeof source.url === "string"
      ) {
        await expect(
          fs.stat(path.resolve(corpusRoot, source.url)),
        ).resolves.toMatchObject({ isFile: expect.any(Function) });
      }
    }

    for (const fixture of manifest.cases) {
      expect(fixture.targets.length).toBeGreaterThan(0);
      expect(fixture.rationale.trim()).not.toBe("");
      expect(fixture.assumption_sources.length).toBeGreaterThan(0);
      for (const source of fixture.assumption_sources) {
        expect(manifest.security_assumptions).toHaveProperty(source);
      }
    }
  });

  for (const fixture of manifest.cases) {
    it(fixture.id, async () => {
      const fixtureRoot = path.join(corpusRoot, fixture.path);
      const result = await scanRepository(fixtureRoot);
      const actualFindings = [...result.findings].sort((left, right) =>
        findingSignature(left).localeCompare(findingSignature(right)),
      );
      const expectedFindings = [...fixture.expected.findings].sort(
        (left, right) =>
          expectedFindingSignature(left).localeCompare(
            expectedFindingSignature(right),
          ),
      );

      expect(actualFindings.map(findingSignature)).toEqual(
        expectedFindings.map(expectedFindingSignature),
      );
      for (const [index, expected] of expectedFindings.entries()) {
        const actual = actualFindings[index];
        expect(actual?.line ?? 0).toBeGreaterThanOrEqual(
          expected.location.line_min,
        );
        expect([...(actual?.reachable_events ?? [])].sort()).toEqual(
          [...fixture.expected.reachable_events].sort(),
        );
      }

      const actualDiagnostics = [...result.diagnostics].sort((left, right) =>
        diagnosticSignature(left).localeCompare(diagnosticSignature(right)),
      );
      const expectedDiagnostics = [...fixture.expected.diagnostics].sort(
        (left, right) =>
          expectedDiagnosticSignature(left).localeCompare(
            expectedDiagnosticSignature(right),
          ),
      );
      expect(actualDiagnostics.map(diagnosticSignature)).toEqual(
        expectedDiagnostics.map(expectedDiagnosticSignature),
      );
      for (const [index, expected] of expectedDiagnostics.entries()) {
        expect(actualDiagnostics[index]?.line ?? 0).toBeGreaterThanOrEqual(
          expected.location.line_min,
        );
      }

      if (fixture.expected.agent_usages) {
        const actualAgentUsages = [...result.agent_usages].sort((left, right) =>
          agentUsageSignature(left).localeCompare(agentUsageSignature(right)),
        );
        const expectedAgentUsages = [...fixture.expected.agent_usages].sort(
          (left, right) =>
            agentUsageSignature(left).localeCompare(agentUsageSignature(right)),
        );
        expect(actualAgentUsages.map(agentUsageSignature)).toEqual(
          expectedAgentUsages.map(agentUsageSignature),
        );
        for (const [index, expected] of expectedAgentUsages.entries()) {
          const actual = actualAgentUsages[index];
          expect(actual?.line ?? 0).toBeGreaterThanOrEqual(expected.line_min);
          expect([...(actual?.reachable_events ?? [])].sort()).toEqual(
            [...expected.reachable_events].sort(),
          );
          expect(actual?.call_chain ?? []).toEqual(expected.call_chain ?? []);
        }
      }

      expect(result.analysis_complete).toBe(fixture.expected.analysis_complete);

      const workflows = await loadWorkflowFiles(fixtureRoot);
      const subject = workflows.find(
        (workflow) =>
          path.relative(fixtureRoot, workflow.path) === fixture.subject.file,
      );
      if (
        subject &&
        !subject.parse_error &&
        fixture.subject.job &&
        isRecord(subject.document)
      ) {
        const directEvents = normalizeTriggers(
          subject.document.on ?? subject.document["on"],
        );
        const jobs = isRecord(subject.document.jobs)
          ? subject.document.jobs
          : {};
        const job = jobs[fixture.subject.job];
        if (
          directEvents.length > 0 &&
          !directEvents.includes("workflow_call") &&
          isRecord(job)
        ) {
          expect(narrowEvents(directEvents, job.if).events.sort()).toEqual(
            [...fixture.expected.reachable_events].sort(),
          );
        }
      }
    });
  }
});
