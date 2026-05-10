export type Severity = "low" | "medium" | "high" | "critical";

export type Finding = {
  id: string;
  rule_id: string;
  title: string;
  severity: Severity;
  file: string;
  job?: string;
  step?: string;
  message: string;
  why: string;
  fix: string[];
  evidence: string;
};

export type ScanOptions = {
  cwd: string;
};

export type WorkflowFile = {
  path: string;
  document: unknown;
  raw: string;
};

export type ScanResult = {
  scanned_at: string;
  root: string;
  workflow_count: number;
  findings: Finding[];
  summary: Record<Severity, number>;
};

export type SarifLog = {
  version: "2.1.0";
  $schema: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        informationUri: string;
        rules: Array<{
          id: string;
          name: string;
          shortDescription: { text: string };
          fullDescription: { text: string };
          help: { text: string; markdown: string };
          defaultConfiguration: { level: "note" | "warning" | "error" };
        }>;
      };
    };
    results: Array<{
      ruleId: string;
      level: "note" | "warning" | "error";
      message: { text: string };
      locations: Array<{
        physicalLocation: {
          artifactLocation: { uri: string };
          region?: { startLine?: number };
        };
      }>;
    }>;
  }>;
};
