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
import { parseWorkflowFile, scanWorkflowFiles } from "../src/scanner.ts";
import { unitId } from "../scripts/benchmark/unit-id.mjs";
import {
  loadActionRun,
  projectPrimary as projectPrimaryWithTasks,
} from "../scripts/benchmark/v4-primary-projection.mjs";

const source = ".github/workflows/caller.yml";
const callee = ".github/workflows/agent.yml";
const bridge = ".github/workflows/bridge.yml";
const agentTask = "agentci/agent-usage";
const jobRule = "agentci/broad-write-permissions";
const stepRule = "agentci/unpinned-ai-action";
const caseRecord = { case_id: "synthetic-001", source_path: source };
const registeredTaskIds = [
  agentTask,
  jobRule,
  stepRule,
  "agentci/untrusted-ai-write-token",
  "agentci/gated-ai-write-token",
  "agentci/ai-with-secrets",
];

function projectPrimary(options) {
  return projectPrimaryWithTasks({
    registeredTaskIds,
    ...options,
  });
}

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

function unit(scope, job_id, step_index, rule_id) {
  return {
    unit_id: unitId(caseRecord.case_id, scope, job_id, step_index, rule_id),
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
  const actionManifestPath = path.join(temporary, "action", "action.yml");
  const actionBundlePath = path.join(temporary, "action", "dist", "action.js");
  const lockfilePath = path.join(temporary, "action", "pnpm-lock.yaml");
  const jsonPath = path.join(outputRoot, "scan.json");
  const snapshot =
    "on: issue_comment\njobs:\n  agent:\n    runs-on: ubuntu-latest\n";
  const bundle = "// synthetic Action bundle\n";
  const manifest = "runs:\n  using: node24\n  main: dist/action.js\n";
  const lockfile = "lockfileVersion: '9.0'\n";
  const boundResult = { ...result, root: inputRoot };
  const json = JSON.stringify(boundResult);
  mkdirSync(path.dirname(snapshotPath), { recursive: true });
  mkdirSync(path.dirname(actionBundlePath), { recursive: true });
  mkdirSync(outputRoot);
  writeFileSync(snapshotPath, snapshot);
  writeFileSync(actionBundlePath, bundle);
  writeFileSync(actionManifestPath, manifest);
  writeFileSync(lockfilePath, lockfile);
  writeFileSync(jsonPath, json);
  const selectedCase = { ...caseRecord, sha256: sha256(snapshot) };
  const actionCommit = "a".repeat(40);
  const runReceipt = {
    case_id: selectedCase.case_id,
    source_path: selectedCase.source_path,
    action_commit: actionCommit,
    action_manifest_sha256: sha256(manifest),
    lockfile_sha256: sha256(lockfile),
    output_sha256: sha256(json),
    input_files: [{ path: source, sha256: selectedCase.sha256 }],
    outcome: "success",
    fail_on: "none",
  };
  return {
    temporary,
    result: boundResult,
    snapshotPath,
    actionManifestPath,
    actionBundlePath,
    lockfilePath,
    jsonPath,
    options: {
      caseRecord: selectedCase,
      inputRoot,
      actionManifestPath,
      actionBundlePath,
      lockfilePath,
      expectedManifestSha256: sha256(manifest),
      expectedBundleSha256: sha256(bundle),
      expectedLockfileSha256: sha256(lockfile),
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
  it("accepts a hash-bound complete Action JSON with a consistent root", async () => {
    const fixture = actionRun();
    try {
      expect(await load(fixture.options)).toEqual({
        result: fixture.result,
        run_incomplete: false,
      });
    } finally {
      rmSync(fixture.temporary, { recursive: true, force: true });
    }
  });

  it.each([
    [
      "finding",
      scan({
        findings: [
          finding("ghost", jobRule, { file: ".github/workflows/ghost.yml" }),
        ],
      }),
    ],
    [
      "agent usage",
      scan({
        agent_usages: [usage("ghost", { file: ".github/workflows/ghost.yml" })],
      }),
    ],
    [
      "diagnostic",
      scan({
        analysis_complete: false,
        diagnostics: [
          {
            code: "agentci/analysis-event-condition",
            kind: "analysis",
            severity: "warning",
            file: ".github/workflows/ghost.yml",
            message: "Synthetic only",
          },
        ],
      }),
    ],
    [
      "caller chain",
      scan({
        findings: [
          finding("ghost-chain", jobRule, {
            call_chain: [".github/workflows/ghost.yml#agent"],
          }),
        ],
      }),
    ],
    [
      "diagnostic caller chain",
      scan({
        analysis_complete: false,
        diagnostics: [
          {
            code: "agentci/analysis-event-condition",
            kind: "analysis",
            severity: "warning",
            file: source,
            call_chain: [".github/workflows/ghost.yml#agent"],
            message: "Synthetic only",
          },
        ],
      }),
    ],
  ])(
    "rejects a %s from a workflow missing in the input inventory",
    async (_kind, result) => {
      const fixture = actionRun(result);
      try {
        await expect(load(fixture.options)).rejects.toThrow(/workflow/);
      } finally {
        rmSync(fixture.temporary, { recursive: true, force: true });
      }
    },
  );

  it("rejects a malformed diagnostic caller chain", async () => {
    const fixture = actionRun(
      scan({
        analysis_complete: false,
        diagnostics: [
          {
            code: "agentci/analysis-event-condition",
            kind: "analysis",
            severity: "warning",
            file: source,
            call_chain: "",
            message: "Synthetic only",
          },
        ],
      }),
    );
    try {
      await expect(load(fixture.options)).rejects.toThrow(/call_chain/);
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

  it("rejects JSON from a different scan root with the same workflow count", async () => {
    const fixture = actionRun();
    try {
      const otherRoot = path.join(fixture.temporary, "other-input");
      const otherWorkflow = path.join(otherRoot, source);
      mkdirSync(path.dirname(otherWorkflow), { recursive: true });
      writeFileSync(otherWorkflow, "on: push\njobs: {}\n");
      const otherJson = JSON.stringify(scan({ root: otherRoot }));
      writeFileSync(fixture.jsonPath, otherJson);
      await expect(
        load({
          ...fixture.options,
          runReceipt: {
            ...fixture.options.runReceipt,
            output_sha256: sha256(otherJson),
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

  it("rejects an altered Action manifest or lockfile even when the bundle is unchanged", async () => {
    const fixture = actionRun();
    try {
      const redirected = "runs:\n  using: node24\n  main: other.js\n";
      writeFileSync(fixture.actionManifestPath, redirected);
      await expect(
        load({
          ...fixture.options,
          expectedManifestSha256: sha256(redirected),
          runReceipt: {
            ...fixture.options.runReceipt,
            action_manifest_sha256: sha256(redirected),
          },
        }),
      ).rejects.toThrow();
      writeFileSync(
        fixture.actionManifestPath,
        "runs:\n  using: node24\n  main: dist/action.js\n",
      );
      writeFileSync(fixture.lockfilePath, "lockfileVersion: '10.0'\n");
      await expect(load(fixture.options)).rejects.toThrow();
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
        JSON.stringify(
          scan({
            root: fixture.options.inputRoot,
            workflow_count: 2,
            findings: [finding("auxiliary", jobRule, { file: sibling })],
          }),
        ),
      );
      withSibling.runReceipt.output_sha256 = sha256(
        readFileSync(fixture.jsonPath),
      );
      expect((await load(withSibling)).result.findings[0].file).toBe(sibling);
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
      expect(await load(options)).toEqual({
        result: fixture.result,
        run_incomplete: true,
      });
      writeFileSync(
        fixture.jsonPath,
        JSON.stringify(scan({ root: fixture.options.inputRoot })),
      );
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
  it("uses the generator's canonical encoded unit ID contract", () => {
    expect(unit("job", "agent", null, jobRule).unit_id).toBe(
      "synthetic-001|job|agent|-|agentci%2Fbroad-write-permissions",
    );
    expect(unit("step", "agent", 0, agentTask).unit_id).toBe(
      "synthetic-001|step|agent|0|agentci%2Fagent-usage",
    );
  });

  it("rejects swapped unit IDs even when the frozen ID set still matches", () => {
    const agent = unit("job", "agent", null, jobRule);
    const other = unit("job", "other", null, jobRule);
    const registryRows = [
      { ...agent, unit_id: other.unit_id },
      { ...other, unit_id: agent.unit_id },
    ];

    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: [agent.unit_id, other.unit_id],
        result: scan({ findings: [finding("agent-write", jobRule)] }),
      }),
    ).toThrow(/unit ID does not match registry identity/);
  });

  it("maps direct job and zero-based step records by exact structure, not step name", () => {
    const registryRows = [
      unit("job", "agent", null, jobRule),
      unit("step", "agent", 0, stepRule),
      unit("step", "agent", 1, stepRule),
      unit("step", "agent", 0, agentTask),
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
        expectedUnitIds: registryRows.map((row) => row.unit_id),
        result,
      }),
    ).toEqual({
      units: [
        {
          unit_id: registryRows[0].unit_id,
          alert: true,
          matched_records: [{ kind: "finding", index: 0, id: "job-finding" }],
        },
        { unit_id: registryRows[1].unit_id, alert: false, matched_records: [] },
        {
          unit_id: registryRows[2].unit_id,
          alert: true,
          matched_records: [{ kind: "finding", index: 1, id: "step-finding" }],
        },
        {
          unit_id: registryRows[3].unit_id,
          alert: true,
          matched_records: [
            { kind: "agent_usage", index: 0, id: "agent-record" },
          ],
        },
      ],
      parse_gap_unit_ids: [],
      structural_gap_unit_ids: [],
      out_of_scope_records: [],
    });
  });

  it("keeps two callers of the same callee in distinct job and reusable-call units", () => {
    const registryRows = [
      unit("job", "first", null, jobRule),
      unit("job", "second", null, jobRule),
      unit("reusable-call", "first", null, agentTask),
      unit("reusable-call", "second", null, agentTask),
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
        expectedUnitIds: registryRows.map((row) => row.unit_id),
        result,
      }),
    ).toEqual({
      units: [
        {
          unit_id: registryRows[0].unit_id,
          alert: true,
          matched_records: [{ kind: "finding", index: 0, id: "first-write" }],
        },
        {
          unit_id: registryRows[1].unit_id,
          alert: true,
          matched_records: [{ kind: "finding", index: 1, id: "second-write" }],
        },
        {
          unit_id: registryRows[2].unit_id,
          alert: true,
          matched_records: [
            { kind: "agent_usage", index: 0, id: "first-agent" },
          ],
        },
        {
          unit_id: registryRows[3].unit_id,
          alert: true,
          matched_records: [
            { kind: "agent_usage", index: 1, id: "second-agent" },
          ],
        },
      ],
      parse_gap_unit_ids: [],
      structural_gap_unit_ids: [],
      out_of_scope_records: [],
    });
  });

  it("uses only the first ordered caller in a nested chain", () => {
    const registryRows = [unit("reusable-call", "top", null, agentTask)];
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
        expectedUnitIds: [registryRows[0].unit_id],
        result,
      }),
    ).toEqual({
      units: [
        {
          unit_id: registryRows[0].unit_id,
          alert: true,
          matched_records: [
            { kind: "agent_usage", index: 0, id: "nested-agent" },
          ],
        },
      ],
      parse_gap_unit_ids: [],
      structural_gap_unit_ids: [],
      out_of_scope_records: [
        { kind: "agent_usage", index: 1, id: "auxiliary-agent" },
      ],
    });
  });

  it("rejects an in-scope nested record whose first caller is not the selected source", () => {
    const registryRows = [unit("reusable-call", "top", null, agentTask)];
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: [registryRows[0].unit_id],
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
    const registryRows = [unit("reusable-call", "top", null, agentTask)];
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: [registryRows[0].unit_id],
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
      unit("job", "agent", null, "agentci/untrusted-ai-write-token"),
      unit("job", "agent", null, "agentci/gated-ai-write-token"),
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
        expectedUnitIds: registryRows.map((row) => row.unit_id),
        result,
      }),
    ).toEqual({
      units: [
        {
          unit_id: registryRows[0].unit_id,
          alert: true,
          matched_records: [
            { kind: "finding", index: 0, id: "write-1" },
            { kind: "finding", index: 1, id: "write-2" },
          ],
        },
        {
          unit_id: registryRows[1].unit_id,
          alert: true,
          matched_records: [{ kind: "finding", index: 2, id: "gated-1" }],
        },
      ],
      parse_gap_unit_ids: [],
      structural_gap_unit_ids: [],
      out_of_scope_records: [],
    });
  });

  it("rejects an unmatched selected-source record and duplicate registry identity", () => {
    const registryRows = [unit("job", "agent", null, jobRule)];
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: [registryRows[0].unit_id],
        result: scan({
          findings: [finding("other-job", jobRule, { job: "other" })],
        }),
      }),
    ).toThrow();
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows: [registryRows[0], { ...registryRows[0] }],
        expectedUnitIds: [registryRows[0].unit_id],
        result: scan(),
      }),
    ).toThrow();
  });

  it("rejects a missing registry unit instead of treating its finding as out of scope", () => {
    const registryRows = [unit("job", "agent", null, jobRule)];
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: [
          registryRows[0].unit_id,
          unitId(caseRecord.case_id, "job", "other", null, jobRule),
        ],
        result: scan({ findings: [finding("known-finding", jobRule)] }),
      }),
    ).toThrow();
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows: [],
        expectedUnitIds: [registryRows[0].unit_id],
        result: scan({ findings: [finding("known-finding", jobRule)] }),
      }),
    ).toThrow();
  });

  it("rejects a selected-source finding for a registered task without a unit", () => {
    const registryRow = unit("job", "agent", null, jobRule);
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows: [registryRow],
        expectedUnitIds: [registryRow.unit_id],
        registeredTaskIds: [jobRule, "agentci/ai-with-secrets"],
        result: scan({
          findings: [finding("missing-unit", "agentci/ai-with-secrets")],
        }),
      }),
    ).toThrow();
  });

  it("requires an independent task vocabulary and audits unregistered findings separately", () => {
    const registryRow = unit("job", "agent", null, jobRule);
    const options = {
      caseRecord,
      registryRows: [registryRow],
      expectedUnitIds: [registryRow.unit_id],
      result: scan({
        findings: [finding("new-rule", "agentci/not-in-frozen-contract")],
      }),
    };
    expect(() => projectPrimaryWithTasks(options)).toThrow();
    expect(projectPrimary(options)).toEqual({
      units: [
        { unit_id: registryRow.unit_id, alert: false, matched_records: [] },
      ],
      parse_gap_unit_ids: [],
      structural_gap_unit_ids: [],
      out_of_scope_records: [{ kind: "finding", index: 0, id: "new-rule" }],
    });
  });

  it("rejects a job unit without a concrete job ID", () => {
    const registryRow = unit("job", null, null, jobRule);
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows: [registryRow],
        expectedUnitIds: [registryRow.unit_id],
        result: scan({
          findings: [finding("jobless", jobRule, { job: undefined })],
        }),
      }),
    ).toThrow();
  });

  it("marks workflow parse-gap units no-alert and separately incomplete", () => {
    const registryRows = [unit("workflow", null, null, agentTask)];
    const sourceBytes = Buffer.from("on: [\n");
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
        caseRecord: { ...caseRecord, sha256: sha256(sourceBytes) },
        registryRows,
        expectedUnitIds: [registryRows[0].unit_id],
        sourceBytes,
        result,
      }),
    ).toEqual({
      units: [
        { unit_id: registryRows[0].unit_id, alert: false, matched_records: [] },
      ],
      parse_gap_unit_ids: [registryRows[0].unit_id],
      structural_gap_unit_ids: [],
      out_of_scope_records: [],
    });
  });

  it("keeps a no-jobs workflow row no-alert and structurally incomplete", () => {
    const root = "/synthetic-e3-no-jobs";
    const sourceBytes = Buffer.from("on: push\nname: Synthetic\n");
    const workflow = parseWorkflowFile(
      path.join(root, source),
      sourceBytes.toString("utf8"),
    );
    const result = scanWorkflowFiles([workflow], root, {
      ignore: [],
      ignorePaths: [],
    });
    expect(result.analysis_complete).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const registryRow = unit("workflow", null, null, agentTask);
    expect(
      projectPrimary({
        caseRecord: { ...caseRecord, sha256: sha256(sourceBytes) },
        registryRows: [registryRow],
        expectedUnitIds: [registryRow.unit_id],
        sourceBytes,
        result,
      }),
    ).toEqual({
      units: [
        { unit_id: registryRow.unit_id, alert: false, matched_records: [] },
      ],
      parse_gap_unit_ids: [],
      structural_gap_unit_ids: [registryRow.unit_id],
      out_of_scope_records: [],
    });
  });

  it("rejects a workflow row for a hash-bound source that has jobs", () => {
    const sourceBytes = Buffer.from(
      "on: push\njobs:\n  agent:\n    runs-on: ubuntu-latest\n",
    );
    const registryRow = unit("workflow", null, null, agentTask);
    expect(() =>
      projectPrimary({
        caseRecord: { ...caseRecord, sha256: sha256(sourceBytes) },
        registryRows: [registryRow],
        expectedUnitIds: [registryRow.unit_id],
        sourceBytes,
        result: scan(),
      }),
    ).toThrow();
  });

  it.each([
    ["agentci/analysis-local-reusable-missing", "error"],
    ["agentci/analysis-remote-reusable-workflow", "warning"],
    ["agentci/analysis-reusable-cycle", "warning"],
  ])(
    "keeps unresolved %s caller units no-alert without inventing a callee",
    (code, severity) => {
      const registryRows = [unit("reusable-call", "agent", null, agentTask)];
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
          expectedUnitIds: [registryRows[0].unit_id],
          result,
        }),
      ).toEqual({
        units: [
          {
            unit_id: registryRows[0].unit_id,
            alert: false,
            matched_records: [],
          },
        ],
        parse_gap_unit_ids: [],
        structural_gap_unit_ids: [],
        out_of_scope_records: [],
      });
    },
  );
});
