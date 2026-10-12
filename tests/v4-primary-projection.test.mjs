import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadActionRun,
  projectPrimary,
} from "../scripts/benchmark/v4-primary-projection.mjs";

const source = ".github/workflows/caller.yml";
const callee = ".github/workflows/agent.yml";
const bridge = ".github/workflows/bridge.yml";
const agentTask = "agentci/agent-usage";
const jobRule = "agentci/broad-write-permissions";
const stepRule = "agentci/unpinned-ai-action";
const caseRecord = { case_id: "synthetic-001", source_path: source };

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function scan(overrides = {}) {
  const findings = overrides.findings ?? [];
  return {
    scanned_at: "2026-01-01T00:00:00.000Z",
    root: "/not-a-binding-proof",
    workflow_count: 1,
    agent_usages: [],
    findings: [],
    summary: Object.fromEntries(
      ["low", "medium", "high", "critical"].map((severity) => [
        severity,
        findings.filter((finding) => finding.severity === severity).length,
      ]),
    ),
    diagnostics: [],
    analysis_complete: true,
    ...overrides,
  };
}

function unit(unit_id, scope, job_id, step_index, rule_id) {
  return {
    unit_id,
    case_id: caseRecord.case_id,
    source_path: source,
    scope,
    job_id,
    step_index,
    rule_id,
  };
}

function finding(id, rule_id, options = {}) {
  return {
    id,
    rule_id,
    title: "Synthetic finding",
    severity: "high",
    file: source,
    job: "agent",
    message: "Synthetic only",
    why: "Synthetic only",
    fix: [],
    evidence: "Synthetic only",
    reachable_events: ["issue_comment"],
    call_chain: [],
    ...options,
  };
}

function usage(id, options = {}) {
  return {
    id,
    file: source,
    job: "agent",
    step: "Agent",
    step_index: 0,
    kind: "action",
    evidence: "Synthetic only",
    line: 1,
    reachable_events: ["issue_comment"],
    call_chain: [],
    ...options,
  };
}

function actionRun(result = scan()) {
  const temporary = mkdtempSync(
    path.join(os.tmpdir(), "agentci-e3-synthetic-"),
  );
  const inputRoot = path.join(temporary, "input");
  const outputRoot = path.join(temporary, "output");
  const snapshotPath = path.join(inputRoot, source);
  const actionBundlePath = path.join(temporary, "action.js");
  const jsonPath = path.join(outputRoot, "scan.json");
  const snapshot =
    "on: issue_comment\njobs:\n  agent:\n    runs-on: ubuntu-latest\n";
  const bundle = "// synthetic Action bundle\n";
  const json = JSON.stringify(result);
  mkdirSync(path.dirname(snapshotPath), { recursive: true });
  mkdirSync(outputRoot);
  writeFileSync(snapshotPath, snapshot);
  writeFileSync(actionBundlePath, bundle);
  writeFileSync(jsonPath, json);
  const selectedCase = { ...caseRecord, sha256: sha256(snapshot) };
  const actionCommit = "a".repeat(40);
  const runReceipt = {
    case_id: selectedCase.case_id,
    source_path: selectedCase.source_path,
    action_commit: actionCommit,
    output_sha256: sha256(json),
    input_files: [{ path: source, sha256: selectedCase.sha256 }],
    outcome: "success",
    fail_on: "none",
  };
  return {
    temporary,
    snapshotPath,
    actionBundlePath,
    jsonPath,
    options: {
      caseRecord: selectedCase,
      inputRoot,
      actionBundlePath,
      expectedBundleSha256: sha256(bundle),
      expectedActionCommit: actionCommit,
      jsonPath,
      outputRoot,
      runReceipt,
    },
  };
}

async function load(options) {
  return await loadActionRun(options);
}

describe("synthetic E3 Action run binding", () => {
  it("accepts a hash-bound complete Action JSON without trusting its root field", async () => {
    const fixture = actionRun();
    try {
      expect(await load(fixture.options)).toEqual({
        result: scan(),
        run_incomplete: false,
      });
    } finally {
      rmSync(fixture.temporary, { recursive: true, force: true });
    }
  });

  it("rejects a swapped case receipt even when the source bytes and JSON match", async () => {
    const fixture = actionRun();
    try {
      const runReceipt = {
        ...fixture.options.runReceipt,
        case_id: "synthetic-002",
      };
      await expect(load({ ...fixture.options, runReceipt })).rejects.toThrow();
      await expect(
        load({
          ...fixture.options,
          runReceipt: {
            ...fixture.options.runReceipt,
            source_path: ".github/workflows/other.yml",
          },
        }),
      ).rejects.toThrow();
    } finally {
      rmSync(fixture.temporary, { recursive: true, force: true });
    }
  });

  it("rejects changed snapshot bytes, Action bytes, or Action commit", async () => {
    const fixture = actionRun();
    try {
      writeFileSync(fixture.snapshotPath, "on: push\n");
      await expect(load(fixture.options)).rejects.toThrow();
      writeFileSync(
        fixture.snapshotPath,
        "on: issue_comment\njobs:\n  agent:\n    runs-on: ubuntu-latest\n",
      );
      writeFileSync(fixture.actionBundlePath, "// changed bundle\n");
      await expect(load(fixture.options)).rejects.toThrow();
      writeFileSync(fixture.actionBundlePath, "// synthetic Action bundle\n");
      await expect(
        load({
          ...fixture.options,
          runReceipt: {
            ...fixture.options.runReceipt,
            action_commit: "b".repeat(40),
          },
        }),
      ).rejects.toThrow();
    } finally {
      rmSync(fixture.temporary, { recursive: true, force: true });
    }
  });

  it("rejects an unlisted sibling workflow or auto-discovered config", async () => {
    const fixture = actionRun();
    try {
      const sibling = ".github/workflows/sibling.yaml";
      const siblingPath = path.join(fixture.options.inputRoot, sibling);
      writeFileSync(siblingPath, "on: push\njobs: {}\n");
      await expect(load(fixture.options)).rejects.toThrow();
      const withSibling = {
        ...fixture.options,
        runReceipt: {
          ...fixture.options.runReceipt,
          input_files: [
            ...fixture.options.runReceipt.input_files,
            { path: sibling, sha256: sha256(readFileSync(siblingPath)) },
          ],
        },
      };
      writeFileSync(
        fixture.jsonPath,
        JSON.stringify(scan({ workflow_count: 2 })),
      );
      withSibling.runReceipt.output_sha256 = sha256(
        readFileSync(fixture.jsonPath),
      );
      expect((await load(withSibling)).run_incomplete).toBe(false);
      const configPath = path.join(
        fixture.options.inputRoot,
        "agentci.config.json",
      );
      writeFileSync(configPath, '{"ignore":[]}\n');
      await expect(load(withSibling)).rejects.toThrow();
      const withConfig = {
        ...withSibling,
        runReceipt: {
          ...withSibling.runReceipt,
          input_files: [
            ...withSibling.runReceipt.input_files,
            {
              path: "agentci.config.json",
              sha256: sha256(readFileSync(configPath)),
            },
          ],
        },
      };
      expect((await load(withConfig)).run_incomplete).toBe(false);
    } finally {
      rmSync(fixture.temporary, { recursive: true, force: true });
    }
  });

  it("rejects absent, malformed, or hash-mismatched JSON as invalid runs", async () => {
    const fixture = actionRun();
    try {
      writeFileSync(fixture.jsonPath, "{malformed");
      await expect(
        load({
          ...fixture.options,
          runReceipt: {
            ...fixture.options.runReceipt,
            output_sha256: sha256(readFileSync(fixture.jsonPath)),
          },
        }),
      ).rejects.toThrow();
      writeFileSync(
        fixture.jsonPath,
        JSON.stringify(scan({ findings: [finding("x", jobRule)] })),
      );
      await expect(load(fixture.options)).rejects.toThrow();
      unlinkSync(fixture.jsonPath);
      await expect(load(fixture.options)).rejects.toThrow();
    } finally {
      rmSync(fixture.temporary, { recursive: true, force: true });
    }
  });

  it("rejects a digest-matched JSON stub without the complete Action result envelope", async () => {
    const fixture = actionRun({
      findings: [],
      agent_usages: [],
      diagnostics: [],
      analysis_complete: true,
    });
    try {
      await expect(load(fixture.options)).rejects.toThrow();
    } finally {
      rmSync(fixture.temporary, { recursive: true, force: true });
    }
  });

  it("rejects output paths outside the trusted output root", async () => {
    const fixture = actionRun();
    try {
      const jsonPath = path.join(fixture.temporary, "outside.json");
      writeFileSync(jsonPath, readFileSync(fixture.jsonPath));
      await expect(load({ ...fixture.options, jsonPath })).rejects.toThrow();
    } finally {
      rmSync(fixture.temporary, { recursive: true, force: true });
    }
  });

  it("keeps valid Action JSON with an error diagnostic and exit 1 as incomplete", async () => {
    const result = scan({
      analysis_complete: false,
      diagnostics: [
        {
          code: "agentci/analysis-reusable-unavailable",
          kind: "analysis",
          severity: "error",
          file: source,
          message: "Synthetic callee unavailable",
        },
      ],
    });
    const fixture = actionRun(result);
    try {
      const options = {
        ...fixture.options,
        runReceipt: { ...fixture.options.runReceipt, outcome: "failure" },
      };
      expect(await load(options)).toEqual({ result, run_incomplete: true });
      writeFileSync(fixture.jsonPath, JSON.stringify(scan()));
      await expect(
        load({
          ...options,
          runReceipt: {
            ...options.runReceipt,
            output_sha256: sha256(readFileSync(fixture.jsonPath)),
          },
        }),
      ).rejects.toThrow();
    } finally {
      rmSync(fixture.temporary, { recursive: true, force: true });
    }
  });
});

describe("synthetic E3 primary unit projection", () => {
  it("maps direct job and zero-based step records by exact structure, not step name", () => {
    const registryRows = [
      unit("job", "job", "agent", null, jobRule),
      unit("step-0", "step", "agent", 0, stepRule),
      unit("step-1", "step", "agent", 1, stepRule),
      unit("usage-0", "step", "agent", 0, agentTask),
    ];
    const result = scan({
      findings: [
        finding("job-finding", jobRule),
        finding("step-finding", stepRule, {
          step: "Repeated name",
          step_index: 1,
        }),
      ],
      agent_usages: [usage("agent-record", { step: "Repeated name" })],
    });
    expect(
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: ["job", "step-0", "step-1", "usage-0"],
        result,
      }),
    ).toEqual({
      units: [
        {
          unit_id: "job",
          alert: true,
          matched_records: [{ kind: "finding", index: 0, id: "job-finding" }],
        },
        { unit_id: "step-0", alert: false, matched_records: [] },
        {
          unit_id: "step-1",
          alert: true,
          matched_records: [{ kind: "finding", index: 1, id: "step-finding" }],
        },
        {
          unit_id: "usage-0",
          alert: true,
          matched_records: [
            { kind: "agent_usage", index: 0, id: "agent-record" },
          ],
        },
      ],
      parse_gap_unit_ids: [],
      out_of_scope_records: [],
    });
  });

  it("keeps two callers of the same callee in distinct job and reusable-call units", () => {
    const registryRows = [
      unit("first-job", "job", "first", null, jobRule),
      unit("second-job", "job", "second", null, jobRule),
      unit("first-call", "reusable-call", "first", null, agentTask),
      unit("second-call", "reusable-call", "second", null, agentTask),
    ];
    const result = scan({
      findings: [
        finding("first-write", jobRule, {
          file: callee,
          call_chain: [`${source}#first`],
        }),
        finding("second-write", jobRule, {
          file: callee,
          call_chain: [`${source}#second`],
        }),
      ],
      agent_usages: [
        usage("first-agent", { file: callee, call_chain: [`${source}#first`] }),
        usage("second-agent", {
          file: callee,
          call_chain: [`${source}#second`],
        }),
      ],
    });
    expect(
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: [
          "first-job",
          "second-job",
          "first-call",
          "second-call",
        ],
        result,
      }),
    ).toEqual({
      units: [
        {
          unit_id: "first-job",
          alert: true,
          matched_records: [{ kind: "finding", index: 0, id: "first-write" }],
        },
        {
          unit_id: "second-job",
          alert: true,
          matched_records: [{ kind: "finding", index: 1, id: "second-write" }],
        },
        {
          unit_id: "first-call",
          alert: true,
          matched_records: [
            { kind: "agent_usage", index: 0, id: "first-agent" },
          ],
        },
        {
          unit_id: "second-call",
          alert: true,
          matched_records: [
            { kind: "agent_usage", index: 1, id: "second-agent" },
          ],
        },
      ],
      parse_gap_unit_ids: [],
      out_of_scope_records: [],
    });
  });

  it("uses only the first ordered caller in a nested chain", () => {
    const registryRows = [
      unit("top-call", "reusable-call", "top", null, agentTask),
    ];
    const result = scan({
      agent_usages: [
        usage("nested-agent", {
          file: callee,
          call_chain: [`${source}#top`, `${bridge}#middle`],
        }),
        usage("auxiliary-agent", {
          file: callee,
          call_chain: [],
        }),
      ],
    });
    expect(
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: ["top-call"],
        result,
      }),
    ).toEqual({
      units: [
        {
          unit_id: "top-call",
          alert: true,
          matched_records: [
            { kind: "agent_usage", index: 0, id: "nested-agent" },
          ],
        },
      ],
      parse_gap_unit_ids: [],
      out_of_scope_records: [
        { kind: "agent_usage", index: 1, id: "auxiliary-agent" },
      ],
    });
  });

  it("rejects an in-scope nested record whose first caller is not the selected source", () => {
    const registryRows = [
      unit("top-call", "reusable-call", "top", null, agentTask),
    ];
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: ["top-call"],
        result: scan({
          agent_usages: [
            usage("wrong-order", {
              file: callee,
              call_chain: [`${bridge}#middle`, `${source}#top`],
            }),
          ],
        }),
      }),
    ).toThrow();
  });

  it("rejects malformed caller-chain shape instead of guessing a mapping", () => {
    const registryRows = [
      unit("top-call", "reusable-call", "top", null, agentTask),
    ];
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: ["top-call"],
        result: scan({
          agent_usages: [
            usage("bad-chain", {
              file: callee,
              call_chain: [`${source}#top`, 42],
            }),
          ],
        }),
      }),
    ).toThrow();
  });

  it("ORs raw multiplicity within one unit without collapsing distinct rules", () => {
    const registryRows = [
      unit("write", "job", "agent", null, "agentci/untrusted-ai-write-token"),
      unit("gated", "job", "agent", null, "agentci/gated-ai-write-token"),
    ];
    const result = scan({
      findings: [
        finding("write-1", "agentci/untrusted-ai-write-token"),
        finding("write-2", "agentci/untrusted-ai-write-token"),
        finding("gated-1", "agentci/gated-ai-write-token"),
      ],
    });
    expect(
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: ["write", "gated"],
        result,
      }),
    ).toEqual({
      units: [
        {
          unit_id: "write",
          alert: true,
          matched_records: [
            { kind: "finding", index: 0, id: "write-1" },
            { kind: "finding", index: 1, id: "write-2" },
          ],
        },
        {
          unit_id: "gated",
          alert: true,
          matched_records: [{ kind: "finding", index: 2, id: "gated-1" }],
        },
      ],
      parse_gap_unit_ids: [],
      out_of_scope_records: [],
    });
  });

  it("rejects an unmatched selected-source record and duplicate registry identity", () => {
    const registryRows = [unit("known", "job", "agent", null, jobRule)];
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: ["known"],
        result: scan({
          findings: [finding("other-job", jobRule, { job: "other" })],
        }),
      }),
    ).toThrow();
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows: [registryRows[0], { ...registryRows[0] }],
        expectedUnitIds: ["known"],
        result: scan(),
      }),
    ).toThrow();
  });

  it("rejects a missing registry unit instead of treating its finding as out of scope", () => {
    const registryRows = [unit("known", "job", "agent", null, jobRule)];
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: ["known", "missing"],
        result: scan({ findings: [finding("known-finding", jobRule)] }),
      }),
    ).toThrow();
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows: [],
        expectedUnitIds: ["known"],
        result: scan({ findings: [finding("known-finding", jobRule)] }),
      }),
    ).toThrow();
  });

  it("rejects a job unit without a concrete job ID", () => {
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows: [unit("missing-job", "job", null, null, jobRule)],
        expectedUnitIds: ["missing-job"],
        result: scan({
          findings: [finding("jobless", jobRule, { job: undefined })],
        }),
      }),
    ).toThrow();
  });

  it("marks workflow parse-gap units no-alert and separately incomplete", () => {
    const registryRows = [unit("parse-gap", "workflow", null, null, agentTask)];
    const result = scan({
      analysis_complete: false,
      diagnostics: [
        {
          code: "agentci/parse-error",
          kind: "parse",
          severity: "error",
          file: source,
          message: "Synthetic YAML parse failure",
        },
      ],
    });
    expect(
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: ["parse-gap"],
        result,
      }),
    ).toEqual({
      units: [{ unit_id: "parse-gap", alert: false, matched_records: [] }],
      parse_gap_unit_ids: ["parse-gap"],
      out_of_scope_records: [],
    });
  });

  it.each([
    ["agentci/analysis-local-reusable-missing", "error"],
    ["agentci/analysis-remote-reusable-workflow", "warning"],
    ["agentci/analysis-reusable-cycle", "warning"],
  ])(
    "keeps unresolved %s caller units no-alert without inventing a callee",
    (code, severity) => {
      const registryRows = [
        unit("call", "reusable-call", "agent", null, agentTask),
      ];
      const result = scan({
        analysis_complete: false,
        diagnostics: [
          {
            code,
            kind: "analysis",
            severity,
            file: source,
            job: "agent",
            message: "Synthetic unresolved call",
          },
        ],
      });
      expect(
        projectPrimary({
          caseRecord,
          registryRows,
          expectedUnitIds: ["call"],
          result,
        }),
      ).toEqual({
        units: [{ unit_id: "call", alert: false, matched_records: [] }],
        parse_gap_unit_ids: [],
        out_of_scope_records: [],
      });
    },
  );
});
