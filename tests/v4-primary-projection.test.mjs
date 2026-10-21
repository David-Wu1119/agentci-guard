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
import { renderCsv } from "../scripts/benchmark/csv.mjs";
import * as primaryProjection from "../scripts/benchmark/v4-primary-projection.mjs";
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

describe("synthetic E3 registry CSV boundary", () => {
  const header = [
    "unit_id",
    "case_id",
    "source_path",
    "scope",
    "job_id",
    "step_index",
    "rule_id",
  ];
  const csv = (rows, extra = []) =>
    renderCsv([
      [...header, ...extra],
      ...rows.map((row) => [...header, ...extra].map((column) => row[column])),
    ]);
  const fromCsv = (text) => primaryProjection.registryRowsFromCsv(text);

  it("normalizes only blank identities and canonical decimal indices", () => {
    const rows = [
      unit("workflow", null, null, agentTask),
      unit("job", "agent", null, jobRule),
      unit("step", "agent", 0, stepRule),
      unit("reusable-call", "agent", null, agentTask),
    ];
    expect(fromCsv(`\uFEFF${csv(rows).replaceAll("\n", "\r\n")}`)).toEqual(
      rows,
    );
  });

  it("drops annotation cells without altering exact projection identities", () => {
    const row = unit("step", "agent", 0, stepRule);
    const registryRows = fromCsv(
      csv(
        [{ ...row, ground_truth: "Synthetic only; not a human label." }],
        ["ground_truth"],
      ),
    );
    expect(registryRows).toEqual([row]);
    expect(
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: [row.unit_id],
        result: scan({
          findings: [finding("direct", stepRule, { step_index: 0 })],
        }),
      }).units,
    ).toEqual([
      {
        unit_id: row.unit_id,
        alert: true,
        matched_records: [{ kind: "finding", index: 0, id: "direct" }],
      },
    ]);
  });

  it("does not upgrade legacy alias unit IDs into structural IDs", () => {
    const row = { ...unit("step", "agent", 0, stepRule), unit_id: "step" };
    const registryRows = fromCsv(csv([row]));
    expect(registryRows[0].unit_id).toBe("step");
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: ["step"],
        result: scan(),
      }),
    ).toThrow(/unit ID does not match registry identity/);
  });

  it.each(["unit_id", "case_id", "rule_id"])(
    "rejects malformed quoting instead of repairing %s",
    (column) => {
      const row = unit("step", "agent", 0, stepRule);
      const cells = header.map((name) => row[name] ?? "");
      const value = row[column];
      cells[header.indexOf(column)] = `${value.slice(0, 1)}"${value.slice(1)}"`;
      const malformed = `${header.join(",")}\n${cells.join(",")}\n`;
      expect(() => fromCsv(malformed)).toThrow(/Invalid CSV/);
    },
  );

  it("does not strip a quoted carriage return into a registered rule", () => {
    const row = unit("step", "agent", 0, stepRule);
    const text = csv([row]).replace(`${stepRule}\n`, `"${stepRule}\r"\n`);
    const registryRows = fromCsv(text);
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: [row.unit_id],
        result: scan(),
      }),
    ).toThrow(/unregistered registry rule/);
    expect(registryRows[0].rule_id).toBe(`${stepRule}\r`);
  });

  it("rejects missing or duplicate headers, malformed rows and empty identities", () => {
    expect(() => fromCsv("unit_id,case_id\nrow,case\n")).toThrow(
      /missing registry column/,
    );
    expect(() => fromCsv(`${header.join(",")}\nrow,case\n`)).toThrow(
      /cells; expected/,
    );
    expect(() =>
      fromCsv(csv([{ ...unit("job", "agent", null, jobRule), unit_id: "" }])),
    ).toThrow(/empty registry cell/);
    expect(() =>
      fromCsv(`${header.join(",")},case_id\na,b,c,d,e,f,g,h\n`),
    ).toThrow(/Duplicate CSV header/);
    expect(() => fromCsv(header.join(",") + "\n")).toThrow(
      /missing registry CSV rows/,
    );
    expect(() => fromCsv('"unterminated')).toThrow(
      /ends inside a quoted field/,
    );
  });

  it.each(["-1", "01", "1.0", "1e2", "9007199254740992", " 0", "NaN"])(
    "rejects non-canonical or unsafe step index %s",
    (stepIndex) => {
      expect(() =>
        fromCsv(
          csv([
            { ...unit("step", "agent", 0, stepRule), step_index: stepIndex },
          ]),
        ),
      ).toThrow(/invalid registry step_index/);
    },
  );

  it("does not erase a contradictory non-step index", () => {
    const row = { ...unit("job", "agent", null, jobRule), step_index: 0 };
    const registryRows = fromCsv(csv([row]));
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: [row.unit_id],
        result: scan(),
      }),
    ).toThrow(/non-step row has a step index/);
  });
});

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

function actionRun(
  result = scan(),
  snapshot = "on: issue_comment\njobs:\n  agent:\n    runs-on: ubuntu-latest\n",
) {
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

describe.each([
  [
    "finding",
    "identical",
    scan({ findings: [finding("same", jobRule), finding("same", jobRule)] }),
  ],
  [
    "finding",
    "contradictory",
    scan({
      findings: [
        finding("same", jobRule),
        finding("same", jobRule, { job: "other" }),
      ],
    }),
  ],
  [
    "agent usage",
    "identical",
    scan({ agent_usages: [usage("same"), usage("same")] }),
  ],
  [
    "agent usage",
    "contradictory",
    scan({ agent_usages: [usage("same"), usage("same", { job: "other" })] }),
  ],
])("duplicate %s IDs (%s)", (kind, _variant, result) => {
  it("invalidates the Action run even with matching hashes", async () => {
    const fixture = actionRun(result);
    try {
      await expect(load(fixture.options)).rejects.toThrow(
        `duplicate ${kind} id: same`,
      );
    } finally {
      rmSync(fixture.temporary, { recursive: true, force: true });
    }
  });

  it("rejects projection instead of alerting multiple units", () => {
    const registryRows = [
      unit("job", "agent", null, jobRule),
      unit("job", "other", null, jobRule),
      unit("step", "agent", 0, agentTask),
      unit("step", "other", 0, agentTask),
    ];
    expect(() =>
      projectPrimary({
        caseRecord,
        registryRows,
        expectedUnitIds: registryRows.map((row) => row.unit_id),
        result,
      }),
    ).toThrow(`duplicate ${kind} id: same`);
  });
});

describe("synthetic E3 Action run binding", () => {
  it("allows the same ID in different record collections", async () => {
    const result = scan({
      findings: [finding("same", jobRule)],
      agent_usages: [usage("same")],
    });
    const fixture = actionRun(result);
    try {
      await expect(load(fixture.options)).resolves.toMatchObject({
        run_incomplete: false,
      });
      const registryRows = [
        unit("job", "agent", null, jobRule),
        unit("step", "agent", 0, agentTask),
      ];
      expect(
        projectPrimary({
          caseRecord,
          registryRows,
          expectedUnitIds: registryRows.map((row) => row.unit_id),
          result,
        }).units.map((row) => row.alert),
      ).toEqual([true, true]);
    } finally {
      rmSync(fixture.temporary, { recursive: true, force: true });
    }
  });

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

  it("rejects a hash-matched agent usage with an invalid kind", async () => {
    const fixture = actionRun(
      scan({ agent_usages: [usage("invalid-kind", { kind: "unknown-kind" })] }),
    );
    try {
      await expect(load(fixture.options)).rejects.toThrow(
        /invalid agent usage kind/,
      );
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

  it.each([
    ["findings", "title"],
    ["findings", "message"],
    ["findings", "why"],
    ["findings", "fix"],
    ["findings", "evidence"],
    ["findings", "fix", [1]],
    ["findings", "step", 1],
    ["findings", "line", 0],
    ["findings", "reachable_events", "push"],
    ["findings", "uncertain_reachable_events", [1]],
    ["agent_usages", "step"],
    ["agent_usages", "kind"],
    ["agent_usages", "kind", "unsupported"],
    ["agent_usages", "evidence"],
    ["agent_usages", "line"],
    ["agent_usages", "line", 0],
    ["agent_usages", "reachable_events"],
    ["agent_usages", "reachable_events", [1]],
    ["agent_usages", "uncertain_reachable_events", "push"],
    ["diagnostics", "message"],
    ["diagnostics", "line", 0],
    ["diagnostics", "job", 1],
    ["diagnostics", "step_index", -1],
  ])(
    "rejects digest-matched Action JSON with invalid %s.%s",
    async (kind, field, invalidValue) => {
      const fixture = actionRun(
        scan({
          findings: [finding("synthetic-finding", jobRule)],
          agent_usages: [usage("synthetic-usage")],
          analysis_complete: false,
          diagnostics: [
            {
              code: "agentci/analysis-event-condition",
              kind: "analysis",
              severity: "warning",
              file: source,
              message: "Synthetic only",
            },
          ],
        }),
      );
      try {
        await expect(load(fixture.options)).resolves.toMatchObject({
          run_incomplete: true,
        });
        if (invalidValue === undefined) delete fixture.result[kind][0][field];
        else fixture.result[kind][0][field] = invalidValue;
        const json = JSON.stringify(fixture.result);
        writeFileSync(fixture.jsonPath, json);
        await expect(
          load({
            ...fixture.options,
            runReceipt: {
              ...fixture.options.runReceipt,
              output_sha256: sha256(json),
            },
          }),
        ).rejects.toThrow();
      } finally {
        rmSync(fixture.temporary, { recursive: true, force: true });
      }
    },
  );

  it("accepts the scanner's diagnostic for an empty job ID", async () => {
    const snapshot =
      'on: issue_comment\njobs:\n  "":\n    if: ${{ unknown() }}\n    runs-on: ubuntu-latest\n';
    const workflow = parseWorkflowFile(
      path.join("/synthetic", source),
      snapshot,
    );
    const result = scanWorkflowFiles([workflow], "/synthetic", {
      ignore: [],
      ignorePaths: [],
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        job: "",
        code: "agentci/analysis-event-condition",
      }),
    ]);
    const fixture = actionRun(result, snapshot);
    try {
      await expect(load(fixture.options)).resolves.toMatchObject({
        run_incomplete: true,
      });
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

  it.each(["agent_usages", "findings"])(
    "rejects selected reusable-workflow %s reached through an external caller",
    (collection) => {
      const root = "/synthetic-e3-selected-callee";
      const workflows = [
        parseWorkflowFile(
          path.join(root, bridge),
          [
            "on: issue_comment",
            "permissions:",
            "  contents: write",
            "jobs:",
            "  invoke:",
            `    uses: ./${source}`,
          ].join("\n"),
        ),
        parseWorkflowFile(
          path.join(root, source),
          [
            "on: workflow_call",
            "jobs:",
            "  agent:",
            "    runs-on: ubuntu-latest",
            "    steps:",
            '      - run: claude -p "Synthetic only"',
          ].join("\n"),
        ),
      ];
      const result = scanWorkflowFiles(workflows, root, {
        ignore: [],
        ignorePaths: [],
      });
      const records = result[collection].filter(
        (record) =>
          record.file === source &&
          record.call_chain?.[0] === `${bridge}#invoke` &&
          (collection === "agent_usages" || record.rule_id === jobRule),
      );
      expect(records).not.toHaveLength(0);
      const registryRow =
        collection === "agent_usages"
          ? unit("step", "agent", 0, agentTask)
          : unit("job", "agent", null, jobRule);
      expect(() =>
        projectPrimary({
          caseRecord,
          registryRows: [registryRow],
          expectedUnitIds: [registryRow.unit_id],
          result: scan({ [collection]: records }),
        }),
      ).toThrow(/selected-source record has an external caller/);
    },
  );

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
        usage("unrelated-external-agent", {
          file: callee,
          call_chain: [`${bridge}#middle`],
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
        { kind: "agent_usage", index: 2, id: "unrelated-external-agent" },
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

  it.each(
    ["job", "step", "reusable-call"].flatMap((scope) => [
      ["parse gap", scope, "on: [\n", true],
      ["structural no-jobs gap", scope, "on: push\nname: Synthetic\n", false],
    ]),
  )(
    "rejects a %s registry mixing workflow and %s rows",
    (_name, scope, raw, hasParseGap) => {
      const sourceBytes = Buffer.from(raw);
      const registryRows = [
        unit("workflow", null, null, agentTask),
        unit(scope, "ghost", scope === "step" ? 0 : null, agentTask),
      ];
      expect(() =>
        projectPrimary({
          caseRecord: { ...caseRecord, sha256: sha256(sourceBytes) },
          registryRows,
          expectedUnitIds: registryRows.map((row) => row.unit_id),
          sourceBytes,
          result: scan({
            analysis_complete: !hasParseGap,
            diagnostics: hasParseGap
              ? [
                  {
                    code: "agentci/parse-error",
                    kind: "parse",
                    severity: "error",
                    file: source,
                    message: "Synthetic YAML parse failure",
                  },
                ]
              : [],
          }),
        }),
      ).toThrow(/workflow gap rows cannot mix with non-workflow rows/);
    },
  );

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
