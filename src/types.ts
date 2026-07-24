export type Severity = "low" | "medium" | "high" | "critical";
export type PermissionLevel = "none" | "read" | "write" | "unknown";
export type PermissionDefault =
  | "unknown"
  | "none"
  | "read-all"
  | "write-all"
  | Record<string, "none" | "read" | "write">;

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
  line?: number;
  reachable_events?: string[];
  call_chain?: string[];
};

export type Diagnostic = {
  code: string;
  kind: "parse" | "analysis";
  severity: "warning" | "error";
  file: string;
  message: string;
  line?: number;
  job?: string;
};

export type ScanOptions = {
  cwd: string;
  /** Explicit path to an agentci config JSON file (overrides discovery). */
  configPath?: string;
};

export type WorkflowFile = {
  path: string;
  document: unknown;
  raw: string;
  parse_error?: {
    message: string;
    line?: number;
  };
};

export type ScanResult = {
  scanned_at: string;
  root: string;
  workflow_count: number;
  findings: Finding[];
  summary: Record<Severity, number>;
  diagnostics: Diagnostic[];
  analysis_complete: boolean;
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
