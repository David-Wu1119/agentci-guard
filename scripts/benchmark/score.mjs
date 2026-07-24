#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { scanRepository } from "../../dist/index.js";

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(repositoryRoot, "benchmark", "manifest.json"),
    "utf8",
  ),
);
const labelsPath = path.resolve(
  process.argv[2] ??
    path.join(repositoryRoot, "benchmark", "labels", "adjudicated.jsonl"),
);
const labelsDirectory = path.dirname(labelsPath);
if (!fs.existsSync(labelsPath)) {
  throw new Error(
    `Missing adjudicated labels: ${labelsPath}. Accuracy must not be reported before two-human annotation and adjudication.`,
  );
}
const independentPaths = [
  path.join(labelsDirectory, "annotator-a.jsonl"),
  path.join(labelsDirectory, "annotator-b.jsonl"),
];
for (const independentPath of independentPaths) {
  if (!fs.existsSync(independentPath)) {
    throw new Error(
      `Missing independent human labels: ${independentPath}. Both passes are mandatory before adjudication.`,
    );
  }
}
const labels = readJsonLines(labelsPath);
const byCase = new Map(labels.map((entry) => [entry.case_id, entry]));
const independentLabels = independentPaths.map((file) => readJsonLines(file));
const annotatorIds = independentLabels.map((entries, index) =>
  validateLabelSet(entries, `annotator-${index === 0 ? "a" : "b"}`),
);
if (annotatorIds[0] === annotatorIds[1]) {
  throw new Error("Independent label files must use different annotator IDs.");
}
validateLabelSet(labels, "adjudicated", true);
const agreement = annotationAgreement(
  independentLabels[0],
  independentLabels[1],
);
const records = [];
const coverageRecords = [];

for (const item of manifest.cases) {
  const annotation = byCase.get(item.case_id);
  if (!annotation) throw new Error(`Missing labels for ${item.case_id}`);
  for (const rule of manifest.rules) {
    if (
      !["positive", "negative", "uncertain"].includes(annotation.labels?.[rule])
    ) {
      throw new Error(`${item.case_id} has no valid label for ${rule}`);
    }
  }

  const snapshotRoot = path.dirname(
    path.dirname(path.dirname(path.join(repositoryRoot, item.snapshot_path))),
  );
  const result = await scanRepository(snapshotRoot);
  coverageRecords.push({
    split: item.split,
    complete: result.analysis_complete,
    diagnostics: result.diagnostics.map((diagnostic) => diagnostic.code),
  });
  const predicted = new Set(result.findings.map((finding) => finding.rule_id));
  for (const rule of manifest.rules) {
    records.push({
      case_id: item.case_id,
      split: item.split,
      rule,
      label: annotation.labels[rule],
      predicted: predicted.has(rule),
      error_type: annotation.error_types?.[rule] ?? "unclassified",
    });
  }
}

const evaluationSplit = process.env.AGENTCI_BENCHMARK_SPLIT ?? "eval";
if (!["dev", "eval", "all"].includes(evaluationSplit)) {
  throw new Error("AGENTCI_BENCHMARK_SPLIT must be dev, eval, or all");
}
const evaluated = records.filter(
  (record) =>
    record.label !== "uncertain" &&
    (evaluationSplit === "all" || record.split === evaluationSplit),
);
const perRule = Object.fromEntries(
  manifest.rules.map((rule) => [
    rule,
    metrics(evaluated.filter((record) => record.rule === rule)),
  ]),
);
const micro = metrics(evaluated);
const uncertain = records.filter(
  (record) =>
    record.label === "uncertain" &&
    (evaluationSplit === "all" || record.split === evaluationSplit),
).length;
const evaluatedCoverage = coverageRecords.filter(
  (record) => evaluationSplit === "all" || record.split === evaluationSplit,
);
const diagnosticCounts = {};
for (const record of evaluatedCoverage) {
  for (const diagnostic of record.diagnostics) {
    diagnosticCounts[diagnostic] = (diagnosticCounts[diagnostic] ?? 0) + 1;
  }
}
const completeWorkflows = evaluatedCoverage.filter(
  (record) => record.complete,
).length;
const errorTaxonomy = {};
for (const record of evaluated) {
  const isError =
    (record.predicted && record.label === "negative") ||
    (!record.predicted && record.label === "positive");
  if (isError) {
    errorTaxonomy[record.error_type] =
      (errorTaxonomy[record.error_type] ?? 0) + 1;
  }
}
const report = {
  benchmark_id: manifest.benchmark_id,
  split: evaluationSplit,
  generated_at: new Date().toISOString(),
  workflow_count: manifest.cases.filter(
    (item) => evaluationSplit === "all" || item.split === evaluationSplit,
  ).length,
  labeled_decisions: evaluated.length,
  uncertain_decisions: uncertain,
  independent_annotation_agreement: agreement,
  analysis_coverage: {
    complete_workflows: completeWorkflows,
    total_workflows: evaluatedCoverage.length,
    rate: completeWorkflows / evaluatedCoverage.length,
    diagnostics: diagnosticCounts,
  },
  micro,
  per_rule: perRule,
  error_taxonomy: errorTaxonomy,
};
const outputDirectory = path.join(repositoryRoot, "benchmark", "results");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, `metrics-${evaluationSplit}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(outputDirectory, `metrics-${evaluationSplit}.md`),
  markdownReport(report),
);
console.log(JSON.stringify(report, null, 2));

function metrics(items) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const item of items) {
    if (item.predicted && item.label === "positive") tp++;
    else if (item.predicted && item.label === "negative") fp++;
    else if (!item.predicted && item.label === "positive") fn++;
    else tn++;
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
    support: tp + fn,
    precision,
    precision_ci95: wilson(tp, tp + fp),
    recall,
    recall_ci95: wilson(tp, tp + fn),
    f1,
  };
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
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

function readJsonLines(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${file}:${index + 1}: ${error.message}`);
      }
    });
}

function validateLabelSet(entries, expectedRole, adjudicated = false) {
  const byCase = new Map(entries.map((entry) => [entry.case_id, entry]));
  if (byCase.size !== manifest.cases.length) {
    throw new Error(
      `${expectedRole} has ${byCase.size} cases; expected ${manifest.cases.length}.`,
    );
  }
  const annotators = new Set();
  for (const item of manifest.cases) {
    const entry = byCase.get(item.case_id);
    if (!entry) throw new Error(`${expectedRole} is missing ${item.case_id}`);
    annotators.add(entry.annotator);
    for (const rule of manifest.rules) {
      if (
        !["positive", "negative", "uncertain"].includes(entry.labels?.[rule])
      ) {
        throw new Error(
          `${expectedRole}/${item.case_id} has no valid label for ${rule}`,
        );
      }
    }
  }
  if (annotators.size !== 1) {
    throw new Error(`${expectedRole} must use one stable annotator ID.`);
  }
  const [annotator] = annotators;
  if (adjudicated && annotator !== "adjudicated") {
    throw new Error('The adjudicated file must use annotator: "adjudicated".');
  }
  if (!adjudicated && (!annotator || annotator === "adjudicated")) {
    throw new Error(`${expectedRole} must use a human annotator pseudonym.`);
  }
  return annotator;
}

function annotationAgreement(leftEntries, rightEntries) {
  const rightByCase = new Map(
    rightEntries.map((entry) => [entry.case_id, entry]),
  );
  const categories = ["positive", "negative", "uncertain"];
  const leftCounts = Object.fromEntries(categories.map((value) => [value, 0]));
  const rightCounts = Object.fromEntries(categories.map((value) => [value, 0]));
  let agreements = 0;
  let total = 0;
  for (const left of leftEntries) {
    const right = rightByCase.get(left.case_id);
    for (const rule of manifest.rules) {
      const leftLabel = left.labels[rule];
      const rightLabel = right.labels[rule];
      leftCounts[leftLabel]++;
      rightCounts[rightLabel]++;
      if (leftLabel === rightLabel) agreements++;
      total++;
    }
  }
  const observed = agreements / total;
  const expected = categories.reduce(
    (sum, category) =>
      sum + (leftCounts[category] / total) * (rightCounts[category] / total),
    0,
  );
  return {
    decisions: total,
    exact_agreement: observed,
    cohens_kappa:
      expected === 1 ? null : (observed - expected) / (1 - expected),
  };
}

function markdownReport(report) {
  const percent = (value) =>
    value === null ? "n/a" : `${(100 * value).toFixed(1)}%`;
  const lines = [
    `# ${report.benchmark_id} metrics (${report.split})`,
    "",
    `- Workflows: ${report.workflow_count}`,
    `- Labeled decisions: ${report.labeled_decisions}`,
    `- Uncertain decisions: ${report.uncertain_decisions}`,
    `- Independent exact agreement: ${percent(report.independent_annotation_agreement.exact_agreement)}`,
    `- Independent Cohen's kappa: ${report.independent_annotation_agreement.cohens_kappa === null ? "n/a" : report.independent_annotation_agreement.cohens_kappa.toFixed(3)}`,
    `- Analysis coverage: ${percent(report.analysis_coverage.rate)}`,
    "",
    "| Rule | Support | Precision | Recall | F1 | FP | FN |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const [rule, value] of Object.entries(report.per_rule)) {
    lines.push(
      `| ${rule} | ${value.support} | ${percent(value.precision)} | ${percent(value.recall)} | ${percent(value.f1)} | ${value.fp} | ${value.fn} |`,
    );
  }
  lines.push(
    "",
    "95% Wilson intervals are available in the JSON result.",
    "",
    "## Error taxonomy",
    "",
  );
  const taxonomy = Object.entries(report.error_taxonomy);
  if (taxonomy.length === 0) lines.push("- No classified errors.");
  else {
    for (const [name, count] of taxonomy) lines.push(`- ${name}: ${count}`);
  }
  lines.push("");
  return lines.join("\n");
}
