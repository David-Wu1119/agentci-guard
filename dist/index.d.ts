declare const AI_AGENT_PATTERNS: RegExp[];
declare function looksLikeAiUsage(value: string): boolean;
declare function containsUntrustedGitHubContext(value: string): boolean;
declare function containsSecretReference(value: string): boolean;
declare function containsShellAccess(value: string): boolean;
declare function isPinnedAction(uses: string): boolean;

type Severity = "low" | "medium" | "high" | "critical";
type Finding = {
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
type ScanOptions = {
    cwd: string;
};
type WorkflowFile = {
    path: string;
    document: unknown;
    raw: string;
};
type ScanResult = {
    scanned_at: string;
    root: string;
    workflow_count: number;
    findings: Finding[];
    summary: Record<Severity, number>;
};
type SarifLog = {
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
                    shortDescription: {
                        text: string;
                    };
                    fullDescription: {
                        text: string;
                    };
                    help: {
                        text: string;
                        markdown: string;
                    };
                    defaultConfiguration: {
                        level: "note" | "warning" | "error";
                    };
                }>;
            };
        };
        results: Array<{
            ruleId: string;
            level: "note" | "warning" | "error";
            message: {
                text: string;
            };
            locations: Array<{
                physicalLocation: {
                    artifactLocation: {
                        uri: string;
                    };
                    region?: {
                        startLine?: number;
                    };
                };
            }>;
        }>;
    }>;
};

declare function renderTextReport(result: ScanResult): string;
declare function renderMarkdownReport(result: ScanResult): string;

type RuleDefinition = {
    id: string;
    title: string;
    severity: Severity;
    why: string;
    fix: string[];
};
declare const RULES: Record<string, RuleDefinition>;
declare const SEVERITY_ORDER: Severity[];

declare function toSarif(findings: Finding[]): SarifLog;

declare function scanRepository(root: string, options?: Partial<ScanOptions>): Promise<ScanResult>;
declare function loadWorkflowFiles(root: string): Promise<WorkflowFile[]>;
declare function scanWorkflow(workflow: WorkflowFile, root: string): Finding[];
declare function hasFindingAtOrAbove(findings: Finding[], severity: Severity): boolean;

export { AI_AGENT_PATTERNS, type Finding, RULES, type RuleDefinition, SEVERITY_ORDER, type SarifLog, type ScanOptions, type ScanResult, type Severity, type WorkflowFile, containsSecretReference, containsShellAccess, containsUntrustedGitHubContext, hasFindingAtOrAbove, isPinnedAction, loadWorkflowFiles, looksLikeAiUsage, renderMarkdownReport, renderTextReport, scanRepository, scanWorkflow, toSarif };
