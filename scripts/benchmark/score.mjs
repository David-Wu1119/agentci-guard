#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RULES, scanRepository } from "../../dist/index.js";
import {
  benchmarkRoot,
  decisionsEqual,
  formatEvidenceLines,
  readJsonLines,
  repositoryRoot,
  validateAnnotationSet,
  validateFinalAgainstSources,
} from "./annotation-lib.mjs";
import { csvObjects, renderCsv } from "./csv.mjs";

const manifest = JSON.parse(
  fs.readFileSync(path.join(benchmarkRoot, "manifest.json"), "utf8"),
);
const labelsPath = path.resolve(
  process.argv[2] ?? path.join(benchmarkRoot, "labels", "adjudicated.jsonl"),
);
const evaluationSplit = process.env.AGENTCI_BENCHMARK_SPLIT ?? "eval";
if (!["dev", "eval", "all"].includes(evaluationSplit)) {
  throw new Error("AGENTCI_BENCHMARK_SPLIT must be dev, eval, or all.");
}
const outputDirectory = path.resolve(
  process.env.AGENTCI_BENCHMARK_OUTPUT_DIR ??
    path.join(benchmarkRoot, "results"),
);
const defaultErrorAnalysis = path.join(
  benchmarkRoot,
  "labels",
  `error-analysis-${evaluationSplit}.csv`,
);
const errorAnalysisPath = path.resolve(process.argv[3] ?? defaultErrorAnalysis);

if (!fs.existsSync(labelsPath)) {
  throw new Error(
    `Missing adjudicated labels: ${labelsPath}. Accuracy must not be reported before human annotation and adjudication.`,
  );
}
const labelsDirectory = path.dirname(labelsPath);
const primaryPath = path.join(labelsDirectory, "annotator-a.jsonl");
const reviewerPath = path.join(labelsDirectory, "annotator-b.jsonl");
for (const file of [primaryPath, reviewerPath]) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing independent human labels: ${file}.`);
  }
}

const primary = validateAnnotationSet(readJsonLines(primaryPath), {
  registryName: "annotation-sheet.csv",
  role: "independent",
});
const reviewer = validateAnnotationSet(readJsonLines(reviewerPath), {
  registryName: "review-sheet.csv",
  role: "independent",
});
const finalLabels = validateAnnotationSet(readJsonLines(labelsPath), {
  registryName: "annotation-sheet.csv",
  role: "final",
  expectedAnnotator: "adjudicated",
});
if (primary.annotator === reviewer.annotator) {
  throw new Error("Independent label files must use different annotators.");
}
validateFinalAgainstSources(finalLabels, primary, reviewer);
if (
  evaluationSplit === "eval" &&
  !["adjudicated", "evaluated"].includes(manifest.status)
) {
  throw new Error(
    `Evaluation split is sealed while benchmark status is ${manifest.status}; publish and adjudicate labels before the first eval run.`,
  );
}
const provenance = scannerProvenance();

const caseRecords = new Map();
for (const record of finalLabels.recordsByUnit.values()) {
  const values = caseRecords.get(record.case_id) ?? [];
  values.push(record);
  caseRecords.set(record.case_id, values);
}

const predictions = [];
const coverageByWorkflow = [];
for (const item of manifest.cases) {
  if (evaluationSplit !== "all" && item.split !== evaluationSplit) continue;
  const snapshotRoot = path.dirname(
    path.dirname(path.dirname(path.join(repositoryRoot, item.snapshot_path))),
  );
  const result = await scanRepository(snapshotRoot);
  coverageByWorkflow.push({
    case_id: item.case_id,
    complete: result.analysis_complete,
    diagnostics: result.diagnostics.map((diagnostic) => diagnostic.code),
  });
  for (const annotation of caseRecords.get(item.case_id) ?? []) {
    const prediction = predict(annotation, result);
    predictions.push({
      ...annotation,
      prediction,
      prediction_events: predictedEvents(annotation, result),
      diagnostic_codes: relevantDiagnostics(annotation, result).map(
        (diagnostic) => diagnostic.code,
      ),
    });
  }
}

const agentRecords = predictions.filter(
  (record) => record.rule_id === manifest.agent_detection_task,
);
const securityRecords = predictions.filter(
  (record) => record.rule_id !== manifest.agent_detection_task,
);
const perRule = Object.fromEntries(
  manifest.rules.map((rule) => [
    rule,
    metricBundle(
      securityRecords.filter((record) => record.rule_id === rule),
      manifest.minimum_positive_support_for_percentage_claims,
    ),
  ]),
);
const agentDetection = metricBundle(
  agentRecords,
  manifest.minimum_positive_support_for_percentage_claims,
);
const securityMicro = metricBundle(
  securityRecords,
  manifest.minimum_positive_support_for_percentage_claims,
);
const securityMacro = {
  supported: macroMetrics(
    Object.values(perRule).map((bundle) => bundle.supported),
  ),
  overall: macroMetrics(Object.values(perRule).map((bundle) => bundle.overall)),
};
const allTasks = metricBundle(
  predictions,
  manifest.minimum_positive_support_for_percentage_claims,
);
const agreement = annotationAgreement(primary, reviewer);
const reviewStatusCounts = countBy(
  [...finalLabels.recordsByUnit.values()],
  (record) => record.review_status,
);
const diagnostics = countBy(
  coverageByWorkflow.flatMap((record) => record.diagnostics),
  (code) => code,
);
const errors = classificationErrors(predictions);

fs.mkdirSync(outputDirectory, { recursive: true });
const errorTemplatePath = path.join(
  outputDirectory,
  `errors-${evaluationSplit}.csv`,
);
fs.writeFileSync(errorTemplatePath, errorTemplate(errors));
const errorAnalysis = loadErrorAnalysis(errorAnalysisPath, errors);
const qualification = qualificationResult({
  agentDetection,
  securityMicro,
  perRule,
  allTasks,
  errorAnalysis,
  provenance,
  agreement,
});

const report = {
  schema_version: 2,
  benchmark_id: manifest.benchmark_id,
  benchmark_status: manifest.status,
  split: evaluationSplit,
  dataset_frozen_at: manifest.frozen_at,
  scanner: provenance,
  workflow_count: coverageByWorkflow.length,
  annotation_units: predictions.length,
  review: {
    ...agreement,
    final_status_counts: reviewStatusCounts,
  },
  analysis_coverage: {
    complete_workflows: coverageByWorkflow.filter((record) => record.complete)
      .length,
    total_workflows: coverageByWorkflow.length,
    rate: ratio(
      coverageByWorkflow.filter((record) => record.complete).length,
      coverageByWorkflow.length,
    ),
    diagnostics,
  },
  agent_detection: agentDetection,
  security_rules: {
    micro: securityMicro,
    macro: securityMacro,
    per_rule: perRule,
  },
  all_tasks: {
    decision_coverage: allTasks.decision_coverage,
    abstention_rate: allTasks.abstention_rate,
    prediction_unknown: allTasks.prediction_unknown,
    ground_truth_indeterminate: allTasks.ground_truth_indeterminate,
  },
  error_analysis: errorAnalysis,
  qualification,
};

const jsonOutput = path.join(
  outputDirectory,
  `metrics-${evaluationSplit}.json`,
);
const markdownOutput = path.join(
  outputDirectory,
  `metrics-${evaluationSplit}.md`,
);
fs.writeFileSync(jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(markdownOutput, markdownReport(report));
console.log(JSON.stringify(report, null, 2));

function predict(annotation, result) {
  const positive =
    annotation.rule_id === manifest.agent_detection_task
      ? result.agent_usages.some((usage) => sameUnit(annotation, usage))
      : result.findings.some(
          (finding) =>
            finding.rule_id === annotation.rule_id &&
            sameUnit(annotation, finding),
        );
  if (positive) return "positive";
  return relevantDiagnostics(annotation, result).length > 0
    ? "unknown"
    : "negative";
}

function predictedEvents(annotation, result) {
  const candidates =
    annotation.rule_id === manifest.agent_detection_task
      ? result.agent_usages.filter((usage) => sameUnit(annotation, usage))
      : result.findings.filter(
          (finding) =>
            finding.rule_id === annotation.rule_id &&
            sameUnit(annotation, finding),
        );
  return [
    ...new Set(
      candidates.flatMap((candidate) => candidate.reachable_events ?? []),
    ),
  ].sort();
}

function sameUnit(annotation, candidate) {
  if (
    candidate.file !== annotation.workflow_file ||
    candidate.job !== annotation.job_id
  ) {
    return false;
  }
  if (annotation.scope === "job") return candidate.step_index === undefined;
  if (annotation.scope === "step") {
    return candidate.step_index === annotation.step_index;
  }
  return false;
}

function relevantDiagnostics(annotation, result) {
  const permissionDependent = new Set([
    "agentci/untrusted-ai-write-token",
    "agentci/broad-write-permissions",
  ]);
  return result.diagnostics.filter((diagnostic) => {
    if (diagnostic.file !== annotation.workflow_file) return false;
    if (diagnostic.job && diagnostic.job !== annotation.job_id) return false;
    if (
      diagnostic.code === "agentci/analysis-permissions-unknown" &&
      !permissionDependent.has(annotation.rule_id)
    ) {
      return false;
    }
    if (
      diagnostic.code === "agentci/analysis-checkout-protection-unknown" &&
      annotation.rule_id !== "agentci/unsafe-checkout"
    ) {
      return false;
    }
    return true;
  });
}

function metricBundle(items, minimumSupport) {
  const determinate = items.filter(
    (item) => item.ground_truth !== "indeterminate",
  );
  const supportedItems = determinate.filter(
    (item) => item.prediction !== "unknown",
  );
  const predictionUnknown = determinate.filter(
    (item) => item.prediction === "unknown",
  ).length;
  const groundTruthIndeterminate = items.length - determinate.length;
  const supported = metrics(supportedItems, false);
  const overall = metrics(determinate, true);
  const positiveSupport = determinate.filter(
    (item) => item.ground_truth === "positive",
  ).length;
  return {
    total_units: items.length,
    determinate_units: determinate.length,
    ground_truth_indeterminate: groundTruthIndeterminate,
    prediction_unknown: predictionUnknown,
    decision_coverage: ratio(supportedItems.length, determinate.length),
    abstention_rate: ratio(predictionUnknown, determinate.length),
    positive_support: positiveSupport,
    percentage_evidence:
      positiveSupport >= minimumSupport ? "sufficient" : "insufficient",
    minimum_positive_support: minimumSupport,
    supported,
    overall,
  };
}

function metrics(items, unknownAsFalseNegative) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let abstainedPositive = 0;
  let abstainedNegative = 0;
  for (const item of items) {
    if (item.prediction === "unknown") {
      if (item.ground_truth === "positive") {
        abstainedPositive++;
        if (unknownAsFalseNegative) fn++;
      } else {
        abstainedNegative++;
      }
    } else if (
      item.prediction === "positive" &&
      item.ground_truth === "positive"
    ) {
      tp++;
    } else if (
      item.prediction === "positive" &&
      item.ground_truth === "negative"
    ) {
      fp++;
    } else if (
      item.prediction === "negative" &&
      item.ground_truth === "positive"
    ) {
      fn++;
    } else {
      tn++;
    }
  }
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);
  return {
    tp,
    fp,
    fn,
    tn,
    abstained_positive: abstainedPositive,
    abstained_negative: abstainedNegative,
    support: tp + fn,
    precision,
    precision_ci95: wilson(tp, tp + fp),
    recall,
    recall_ci95: wilson(tp, tp + fn),
    f1,
  };
}

function macroMetrics(values) {
  return {
    precision: mean(values.map((value) => value.precision)),
    recall: mean(values.map((value) => value.recall)),
    f1: mean(values.map((value) => value.f1)),
    rules_with_precision: values.filter((value) => value.precision !== null)
      .length,
    rules_with_recall: values.filter((value) => value.recall !== null).length,
  };
}

function classificationErrors(records) {
  return records
    .filter((record) => {
      if (record.ground_truth === "indeterminate") return false;
      return (
        (record.prediction === "positive" &&
          record.ground_truth === "negative") ||
        ((record.prediction === "negative" ||
          record.prediction === "unknown") &&
          record.ground_truth === "positive")
      );
    })
    .map((record) => ({
      error_id: [record.unit_id, record.ground_truth, record.prediction].join(
        "|",
      ),
      error_kind:
        record.prediction === "positive"
          ? "false-positive"
          : record.prediction === "unknown"
            ? "abstained-positive"
            : "false-negative",
      ...record,
    }));
}

function errorTemplate(errors) {
  const header = [
    "error_id",
    "error_kind",
    "unit_id",
    "case_id",
    "split",
    "workflow_file",
    "job_id",
    "step_index",
    "step_name",
    "rule_id",
    "ground_truth",
    "prediction",
    "diagnostic_codes",
    "evidence_lines",
    "error_type",
    "explanation",
    "reviewer",
  ];
  const rows = errors.map((error) => [
    error.error_id,
    error.error_kind,
    error.unit_id,
    error.case_id,
    error.split,
    error.workflow_file,
    error.job_id ?? "",
    error.step_index ?? "",
    error.step_name ?? "",
    error.rule_id,
    error.ground_truth,
    error.prediction,
    error.diagnostic_codes.join(";"),
    formatEvidenceLines(error.evidence_lines),
    "",
    "",
    "",
  ]);
  return renderCsv([header, ...rows]);
}

function loadErrorAnalysis(file, errors) {
  const allowedTypes = new Set([
    "agent-not-recognized",
    "non-agent-mistaken-for-agent",
    "environment-propagation",
    "permission-resolution",
    "reachability",
    "capability-inference",
    "reusable-workflow-boundary",
    "platform-version-drift",
    "parser-failure",
    "annotation-disagreement",
    "location-mapping",
    "rule-definition-ambiguity",
    "other",
  ]);
  if (errors.length === 0) {
    return {
      status: "complete",
      total_errors: 0,
      taxonomy: {},
      source: null,
    };
  }
  if (!fs.existsSync(file)) {
    return {
      status: "pending",
      total_errors: errors.length,
      taxonomy: { unclassified: errors.length },
      source: path.relative(repositoryRoot, file),
      instruction: `Copy ${path.relative(repositoryRoot, errorTemplatePath)} to this path, classify every row, and rerun score.mjs.`,
    };
  }
  const rows = csvObjects(fs.readFileSync(file, "utf8"));
  const byId = new Map();
  for (const row of rows) {
    if (!row.error_id || byId.has(row.error_id)) {
      throw new Error(
        `Error analysis has an empty or duplicate ID: ${String(row.error_id)}.`,
      );
    }
    byId.set(row.error_id, row);
  }
  if (byId.size !== errors.length) {
    throw new Error(
      `Error analysis has ${byId.size} rows; current evaluation has ${errors.length} errors.`,
    );
  }
  const taxonomy = {};
  const reviewers = new Set();
  for (const error of errors) {
    const row = byId.get(error.error_id);
    if (!row) throw new Error(`Missing error analysis for ${error.error_id}.`);
    if (!allowedTypes.has(row.error_type)) {
      throw new Error(
        `${error.error_id}: invalid error_type ${row.error_type}.`,
      );
    }
    if (!row.explanation?.trim() || !row.reviewer?.trim()) {
      throw new Error(
        `${error.error_id}: explanation and reviewer are required.`,
      );
    }
    const immutable = {
      error_id: error.error_id,
      error_kind: error.error_kind,
      unit_id: error.unit_id,
      case_id: error.case_id,
      split: error.split,
      workflow_file: error.workflow_file,
      job_id: error.job_id ?? "",
      step_index: error.step_index ?? "",
      step_name: error.step_name ?? "",
      rule_id: error.rule_id,
      ground_truth: error.ground_truth,
      prediction: error.prediction,
      diagnostic_codes: error.diagnostic_codes.join(";"),
      evidence_lines: formatEvidenceLines(error.evidence_lines),
    };
    for (const [field, expected] of Object.entries(immutable)) {
      if (row[field] !== String(expected)) {
        throw new Error(
          `${error.error_id}: error provenance field ${field} was modified.`,
        );
      }
    }
    reviewers.add(row.reviewer.trim());
    taxonomy[row.error_type] = (taxonomy[row.error_type] ?? 0) + 1;
  }
  return {
    status: "complete",
    total_errors: errors.length,
    taxonomy,
    source: path.relative(repositoryRoot, file),
    reviewers: [...reviewers].sort(),
  };
}

function annotationAgreement(primarySet, reviewerSet) {
  const categories = ["positive", "negative", "indeterminate"];
  const leftCounts = Object.fromEntries(
    categories.map((category) => [category, 0]),
  );
  const rightCounts = Object.fromEntries(
    categories.map((category) => [category, 0]),
  );
  let groundTruthAgreements = 0;
  let categoricalAgreements = 0;
  let total = 0;
  for (const [unitId, right] of reviewerSet.recordsByUnit) {
    const left = primarySet.recordsByUnit.get(unitId);
    if (!left) throw new Error(`Primary labels are missing ${unitId}.`);
    leftCounts[left.ground_truth]++;
    rightCounts[right.ground_truth]++;
    if (left.ground_truth === right.ground_truth) groundTruthAgreements++;
    if (decisionsEqual(left, right)) categoricalAgreements++;
    total++;
  }
  const observed = ratio(groundTruthAgreements, total);
  const expected = categories.reduce(
    (sum, category) =>
      sum + (leftCounts[category] / total) * (rightCounts[category] / total),
    0,
  );
  return {
    independently_reviewed_units: total,
    total_units: primarySet.recordsByUnit.size,
    coverage: ratio(total, primarySet.recordsByUnit.size),
    ground_truth_exact_agreement: observed,
    categorical_dimension_exact_agreement: ratio(categoricalAgreements, total),
    cohens_kappa:
      expected === 1 || observed === null
        ? null
        : (observed - expected) / (1 - expected),
  };
}

function qualificationResult({
  agentDetection,
  securityMicro,
  perRule,
  allTasks,
  errorAnalysis,
  provenance,
  agreement,
}) {
  const targets = manifest.qualification_targets;
  const highCriticalRules = Object.values(RULES)
    .filter((rule) => ["high", "critical"].includes(rule.severity))
    .map((rule) => rule.id);
  const checks = {
    agent_detection_precision: metricAtLeast(
      agentDetection.supported.precision,
      targets.agent_detection_precision,
    ),
    agent_detection_overall_recall: metricAtLeast(
      agentDetection.overall.recall,
      targets.agent_detection_recall,
    ),
    security_micro_precision: metricAtLeast(
      securityMicro.supported.precision,
      targets.security_micro_precision,
    ),
    security_overall_recall: metricAtLeast(
      securityMicro.overall.recall,
      targets.security_overall_recall,
    ),
    agent_detection_decision_coverage: metricAtLeast(
      agentDetection.decision_coverage,
      targets.decision_coverage,
    ),
    security_decision_coverage: metricAtLeast(
      securityMicro.decision_coverage,
      targets.decision_coverage,
    ),
    overall_decision_coverage: metricAtLeast(
      allTasks.decision_coverage,
      targets.decision_coverage,
    ),
    independent_review_coverage: metricAtLeast(
      agreement.coverage,
      manifest.minimum_independent_review_coverage,
    ),
    high_critical_rule_precision: highCriticalRules.every((rule) => {
      const result = perRule[rule];
      return (
        result?.percentage_evidence === "sufficient" &&
        metricAtLeast(
          result.supported.precision,
          targets.high_critical_rule_precision,
        )
      );
    }),
    error_analysis_complete: errorAnalysis.status === "complete",
    scanner_worktree_clean: provenance.worktree_clean === true,
  };
  const measurable = Object.values(checks).every((value) => value !== null);
  return {
    phrase: "calibrated experimental linter",
    status:
      measurable && Object.values(checks).every(Boolean)
        ? "passed"
        : "not-passed",
    checks,
    targets,
    note: "These are engineering gates for wording, not evidence that workflows are secure.",
  };
}

function scannerProvenance() {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
    const status = execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=all"],
      { cwd: repositoryRoot, encoding: "utf8" },
    ).trim();
    return { commit, worktree_clean: status === "" };
  } catch {
    return { commit: null, worktree_clean: null };
  }
}

function markdownReport(report) {
  const lines = [
    `# ${report.benchmark_id} metrics (${report.split})`,
    "",
    `Measurement status: **${report.error_analysis.status === "complete" ? "complete" : "preliminary; error classification pending"}**`,
    "",
    `- Workflows: ${report.workflow_count}`,
    `- Annotation units: ${report.annotation_units}`,
    `- Independent review coverage: ${percent(report.review.coverage)}`,
    `- Independent ground-truth agreement: ${percent(report.review.ground_truth_exact_agreement)}`,
    `- Cohen's kappa: ${number(report.review.cohens_kappa)}`,
    `- Static-analysis workflow coverage: ${percent(report.analysis_coverage.rate)}`,
    `- Decision coverage across all tasks: ${percent(report.all_tasks.decision_coverage)}`,
    `- Scanner commit: ${report.scanner.commit ?? "unknown"}`,
    `- Scanner worktree clean before evaluation: ${report.scanner.worktree_clean === true ? "yes" : "no"}`,
    "",
    "## AI-agent usage detection",
    "",
    metricsTableHeader(),
    metricsTableRow("Agent usage", report.agent_detection, "supported"),
    metricsTableRow("Agent usage", report.agent_detection, "overall"),
    "",
    "## Security-rule classification",
    "",
    metricsTableHeader(),
  ];
  for (const [rule, bundle] of Object.entries(report.security_rules.per_rule)) {
    lines.push(metricsTableRow(rule, bundle, "supported"));
    lines.push(metricsTableRow(rule, bundle, "overall"));
    if (bundle.percentage_evidence === "insufficient") {
      lines.push(
        `| ↳ evidence note | ${bundle.positive_support} positives | n/a | n/a | n/a | n/a | n/a | n/a |`,
      );
    }
  }
  lines.push(
    "",
    `- Supported micro precision: ${percent(report.security_rules.micro.supported.precision)}`,
    `- Supported micro recall: ${percent(report.security_rules.micro.supported.recall)}`,
    `- Supported macro F1: ${percent(report.security_rules.macro.supported.f1)}`,
    `- Overall micro recall (scanner abstentions count as false negatives): ${percent(report.security_rules.micro.overall.recall)}`,
    "",
    "## Unknowns and coverage",
    "",
    `- Scanner-unknown decisions: ${report.all_tasks.prediction_unknown}`,
    `- Human-indeterminate decisions: ${report.all_tasks.ground_truth_indeterminate}`,
    `- Scanner abstention rate: ${percent(report.all_tasks.abstention_rate)}`,
    "",
    "## Error analysis",
    "",
    `- Status: ${report.error_analysis.status}`,
    `- Errors: ${report.error_analysis.total_errors}`,
  );
  for (const [name, count] of Object.entries(report.error_analysis.taxonomy)) {
    lines.push(`- ${name}: ${count}`);
  }
  lines.push(
    "",
    "## Qualification gate",
    "",
    `Result: **${report.qualification.status}**`,
    "",
  );
  for (const [name, passed] of Object.entries(report.qualification.checks)) {
    lines.push(`- ${name}: ${passed === true ? "pass" : "fail"}`);
  }
  lines.push(
    "",
    "Confidence intervals are 95% Wilson intervals and are recorded in the JSON result. Low-support rules are not qualified for percentage claims.",
    "",
  );
  return lines.join("\n");
}

function metricsTableHeader() {
  return [
    "| Task | Universe | Support | Precision | Recall | F1 | FP | FN | Unknown |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ].join("\n");
}

function metricsTableRow(name, bundle, universe) {
  const value = bundle[universe];
  return `| ${name} | ${universe} | ${value.support} | ${percent(value.precision)} | ${percent(value.recall)} | ${percent(value.f1)} | ${value.fp} | ${value.fn} | ${bundle.prediction_unknown} |`;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function mean(values) {
  const finite = values.filter((value) => value !== null);
  return finite.length === 0
    ? null
    : finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function metricAtLeast(value, target) {
  return value === null ? null : value >= target;
}

function wilson(successes, trials) {
  if (trials === 0) return null;
  const z = 1.959963984540054;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) /
    denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function countBy(values, key) {
  const output = {};
  for (const value of values) {
    const name = key(value);
    output[name] = (output[name] ?? 0) + 1;
  }
  return output;
}

function percent(value) {
  return value === null ? "n/a" : `${(100 * value).toFixed(1)}%`;
}

function number(value) {
  return value === null ? "n/a" : value.toFixed(3);
}
