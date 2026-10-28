import { version } from "../package.json";
import { parseWorkflowFile, scanWorkflowFiles } from "../src/scanner.js";
import type { ScanResult } from "../src/types.js";
import { normalizeTriggers } from "../src/workflow-model.js";

const root = "/agentci-browser";
const file = `${root}/.github/workflows/input.yml`;
const maxChars = 250_000;
const maxSteps = 500;

class BrowserInputError extends Error {
  readonly code = "agentci/browser-input-invalid";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function scanWorkflowText(raw: string): ScanResult {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Enter a GitHub Actions workflow in YAML.");
  }
  if (raw.length > maxChars) {
    throw new RangeError(`Workflow exceeds ${maxChars} characters.`);
  }
  const workflow = parseWorkflowFile(file, raw);
  if (!workflow.parse_error) {
    const doc = workflow.document;
    if (
      !isRecord(doc) ||
      !("on" in doc) ||
      !("jobs" in doc) ||
      !isRecord(doc.jobs) ||
      normalizeTriggers(doc.on).length === 0 ||
      Object.keys(doc.jobs).length === 0 ||
      Object.values(doc.jobs).some((job) => {
        if (!isRecord(job)) return true;
        const hasCall = typeof job.uses === "string" && !!job.uses.trim();
        const hasSteps =
          Array.isArray(job.steps) &&
          job.steps.length > 0 &&
          job.steps.every(
            (step) =>
              isRecord(step) &&
              (typeof step.run === "string" || typeof step.uses === "string"),
          );
        return hasCall === hasSteps;
      })
    ) {
      throw new BrowserInputError(
        "This is YAML, but not a GitHub Actions workflow with an event and executable jobs.",
      );
    }
    const stepCount = Object.values(doc.jobs).reduce(
      (count, job) =>
        count + ((job as { steps?: unknown[] }).steps?.length ?? 0),
      0,
    );
    if (stepCount > maxSteps) {
      throw new BrowserInputError(
        `Workflow exceeds the browser limit of ${maxSteps} steps.`,
      );
    }
  }
  return scanWorkflowFiles([workflow], root, { ignore: [], ignorePaths: [] });
}

// shortcut: this browser entry scans one virtual file; local reusable calls stay unresolved until multi-file input exists.
// shortcut: main-thread scanning is capped at 500 steps; move it to a Worker if large workflows are needed.
const browserScanner = Object.assign(scanWorkflowText, {
  version,
  maxChars,
  maxSteps,
});
(
  globalThis as typeof globalThis & {
    agentciScanWorkflow: typeof browserScanner;
  }
).agentciScanWorkflow = browserScanner;
