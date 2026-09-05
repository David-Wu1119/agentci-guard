type Severity = "low" | "medium" | "high" | "critical";
type PermissionLevel = "none" | "read" | "write" | "unknown";
type PermissionDefault = "unknown" | "none" | "read-all" | "write-all" | Record<string, "none" | "read" | "write">;
type Finding = {
    id: string;
    rule_id: string;
    title: string;
    severity: Severity;
    file: string;
    job?: string;
    step?: string;
    /** Zero-based index in the job's steps array. */
    step_index?: number;
    message: string;
    why: string;
    fix: string[];
    evidence: string;
    line?: number;
    reachable_events?: string[];
    call_chain?: string[];
};
type AgentUsage = {
    id: string;
    file: string;
    job: string;
    step: string;
    /** Zero-based index in the job's steps array. */
    step_index: number;
    kind: "action" | "cli" | "other";
    evidence: string;
    line: number;
    reachable_events: string[];
    call_chain?: string[];
};
type Diagnostic = {
    code: string;
    kind: "parse" | "analysis";
    severity: "warning" | "error";
    file: string;
    message: string;
    line?: number;
    job?: string;
};
type ScanOptions = {
    cwd: string;
    /** Explicit path to an agentci config JSON file (overrides discovery). */
    configPath?: string;
};
type WorkflowFile = {
    path: string;
    document: unknown;
    raw: string;
    parse_error?: {
        message: string;
        line?: number;
    };
};
type ScanResult = {
    scanned_at: string;
    root: string;
    workflow_count: number;
    agent_usages: AgentUsage[];
    findings: Finding[];
    summary: Record<Severity, number>;
    diagnostics: Diagnostic[];
    analysis_complete: boolean;
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
            properties: {
                "agentci/severity": Severity;
                "agentci/reachableEvents": string[];
                "agentci/job"?: string;
                "agentci/step"?: string;
                "agentci/stepIndex"?: number;
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

type AgentciConfig = {
    /** Rule ids to suppress everywhere, e.g. "agentci/unpinned-ai-action". */
    ignore: string[];
    /** Workflow path globs (relative to scan root) to exclude from reporting. */
    ignorePaths: string[];
    /**
     * Optional repository policy for otherwise-absent workflow permissions.
     * Without this, AgentCI Guard reports the effective permission as unknown.
     */
    defaultPermissions?: PermissionDefault;
};
/** Load config from an explicit path, or by discovery in the scan root. */
declare function loadConfig(root: string, explicitPath?: string): Promise<AgentciConfig>;
/**
 * Standalone top-level, file-level suppression directives:
 *   # agentci-ignore <rule-id> [<rule-id> ...] [-- reason]
 *   # agentci-ignore-all [-- reason]
 *
 * Findings are reported at job/step granularity rather than per line, so
 * suppression is scoped to the whole file. Requiring column-zero YAML comments
 * prevents shell-script comments or quoted prompt text from disabling checks.
 * The optional `-- reason` is for humans and is ignored by the parser.
 */
declare function parseInlineIgnores(raw: string): {
    all: boolean;
    rules: Set<string>;
};
/** Minimal glob match: `*` matches within a path segment, `**` across segments. */
declare function matchesPath(glob: string, target: string): boolean;

declare const AI_AGENT_ACTION_PATTERNS: RegExp[];
declare const AI_AGENT_CLI_PATTERNS: RegExp[];
declare const AI_AGENT_API_PATTERNS: RegExp[];
declare const AI_AGENT_PATTERNS: RegExp[];
/**
 * anthropics/claude-code-action refuses to run for users without repository
 * write access by default (docs/security.md: "The action can only be
 * triggered by users with write access to the repository. This is checked for
 * issue, pull request, comment, and review events"). The lower-level
 * claude-code-base-action performs no such check and is deliberately excluded.
 */
declare function isSelfGatingAgentAction(uses: string): boolean;
/**
 * The default gate is removed by allowlisting non-write users or bots. The
 * docs mark `allowed_non_write_users` "a significant security risk" and note
 * that `allowed_bots` entries are not permission-checked at all, so any
 * non-empty value for either counts as a bypass.
 */
declare function hasAgentGateBypass(withBlock: unknown): boolean;
/**
 * Events on which the action's docs state the write-access check applies.
 * `discussion`, `discussion_comment`, and `pull_request_target` are not listed;
 * a job reachable on any of those keeps its full severity.
 */
declare const SELF_GATED_EVENTS: Set<string>;
declare function looksLikeAiUsage(value: string): boolean;
declare function looksLikeAiAction(value: string): boolean;
/**
 * A shell-driven agent invocation: a local CLI, or an HTTP call to a hosted
 * agent endpoint. Both are grouped here rather than with actions because they
 * receive only what the surrounding script hands them, so untrusted content
 * still has to be interpolated for it to reach the agent.
 */
declare function looksLikeAiCli(value: string): boolean;
declare function containsUntrustedGitHubContext(value: string): boolean;
declare function untrustedGitHubContextEvents(value: string): string[];
declare function containsSecretReference(value: string): boolean;
declare function containsShellAccess(value: unknown): boolean;
declare function isPinnedAction(uses: string): boolean;

type FailOn = "none" | Severity;
declare function parseFailOn(value: string): FailOn;

/**
 * Scan every repository in a GitHub organization (or user account) without
 * cloning anything: list repositories, fetch each one's workflow files through
 * the contents API, and run the same analysis the CLI runs on a checkout.
 *
 * This is the unit an audit or posture engagement actually delivers -- one
 * report across an organization -- rather than one scan per checkout.
 */
type OrgRepository = {
    full_name: string;
    html_url: string;
    default_branch: string;
    archived: boolean;
    fork: boolean;
    stargazers_count: number;
};
type OrgRepositoryResult = {
    repository: string;
    url: string;
    stars: number;
    archived: boolean;
    fork: boolean;
    /** Present when the repository was not analyzed, with the reason. */
    skipped?: string;
    result?: ScanResult;
};
type OrgScanResult = {
    scanned_at: string;
    org: string;
    repository_count: number;
    scanned_count: number;
    skipped_count: number;
    workflow_count: number;
    repositories: OrgRepositoryResult[];
    findings: Finding[];
    summary: Record<Severity, number>;
    analysis_complete: boolean;
};
type OrgScanOptions = {
    /** GitHub token. Unauthenticated requests are limited to 60 per hour. */
    token?: string;
    includeArchived?: boolean;
    includeForks?: boolean;
    /** Injected for tests; defaults to the global fetch. */
    fetch?: typeof fetch;
    apiBase?: string;
    /** Repositories fetched in parallel. */
    concurrency?: number;
    config?: AgentciConfig;
};
declare function scanOrganization(org: string, options?: OrgScanOptions): Promise<OrgScanResult>;
/** The audit deliverable: one Markdown report across the organization. */
declare function renderOrgMarkdownReport(result: OrgScanResult): string;

/**
 * Render the GitHub Actions `$GITHUB_OUTPUT` lines for a scan, so downstream
 * steps can branch on the result (e.g. comment on a PR when critical > 0).
 */
declare function formatGithubOutputs(result: ScanResult, sarifPath?: string): string;
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
/**
 * Analyze an already-loaded set of workflow files as one repository. The
 * filesystem scan and the organization scan both end here, so a fetched
 * workflow is analyzed exactly as a checked-out one.
 */
declare function scanWorkflowFiles(workflows: WorkflowFile[], scanRoot: string, config: AgentciConfig): ScanResult;
declare function loadWorkflowFiles(root: string): Promise<WorkflowFile[]>;
/** Parse raw workflow YAML into a WorkflowFile, recording a parse error instead of throwing. */
declare function parseWorkflowFile(file: string, raw: string): WorkflowFile;
/**
 * Scan one already-parsed workflow. Reusable calls cannot be resolved through
 * this compatibility API; repository scans should use scanRepository.
 */
declare function scanWorkflow(workflow: WorkflowFile, root: string): Finding[];
declare function hasFindingAtOrAbove(findings: Finding[], severity: Severity): boolean;

type EffectivePermissions = {
    default: PermissionLevel;
    scopes: Record<string, PermissionLevel>;
    source: "workflow" | "job" | "configured-default" | "github-default-unknown" | "reusable-merge";
};
type Reachability = {
    events: string[];
    complete: boolean;
};
declare const UNTRUSTED_EVENTS: Set<string>;
declare const SENSITIVE_WRITE_SCOPES: Set<string>;
declare function normalizeTriggers(raw: unknown): string[];
declare function resolvePermissions(workflowRaw: unknown, jobRaw: unknown, configuredDefault?: PermissionDefault, ceiling?: EffectivePermissions): EffectivePermissions;
declare function permissionLevel(permissions: EffectivePermissions, scope: string): PermissionLevel;
declare function hasSensitiveWrite(permissions: EffectivePermissions): boolean;
declare function hasUnknownSensitivePermission(permissions: EffectivePermissions): boolean;
declare function describePermissions(permissions: EffectivePermissions): string;
declare function mergeEnvironment(...layers: unknown[]): Record<string, string>;
/**
 * Narrow workflow triggers using common `github.event_name` predicates.
 *
 * Unsupported event-name expressions are retained conservatively and marked
 * incomplete instead of silently guessing.
 */
declare function narrowEvents(events: string[], rawCondition: unknown): Reachability;
/**
 * Report whether an `if:` condition restricts a job or step to trusted actors.
 *
 * The analysis is an implication check, not an evaluation: a conjunction is
 * trusted when *either* operand is trusted (`A && B` implies `A`), while a
 * disjunction is trusted only when *every* operand is trusted. Everything
 * else, negation included, is treated as untrusted.
 */
declare function hasTrustedActorGate(rawCondition: unknown): boolean;

export { AI_AGENT_ACTION_PATTERNS, AI_AGENT_API_PATTERNS, AI_AGENT_CLI_PATTERNS, AI_AGENT_PATTERNS, type AgentUsage, type AgentciConfig, type Diagnostic, type EffectivePermissions, type FailOn, type Finding, type OrgRepository, type OrgRepositoryResult, type OrgScanOptions, type OrgScanResult, type PermissionDefault, type PermissionLevel, RULES, type Reachability, type RuleDefinition, SELF_GATED_EVENTS, SENSITIVE_WRITE_SCOPES, SEVERITY_ORDER, type SarifLog, type ScanOptions, type ScanResult, type Severity, UNTRUSTED_EVENTS, type WorkflowFile, containsSecretReference, containsShellAccess, containsUntrustedGitHubContext, describePermissions, formatGithubOutputs, hasAgentGateBypass, hasFindingAtOrAbove, hasSensitiveWrite, hasTrustedActorGate, hasUnknownSensitivePermission, isPinnedAction, isSelfGatingAgentAction, loadConfig, loadWorkflowFiles, looksLikeAiAction, looksLikeAiCli, looksLikeAiUsage, matchesPath, mergeEnvironment, narrowEvents, normalizeTriggers, parseFailOn, parseInlineIgnores, parseWorkflowFile, permissionLevel, renderMarkdownReport, renderOrgMarkdownReport, renderTextReport, resolvePermissions, scanOrganization, scanRepository, scanWorkflow, scanWorkflowFiles, toSarif, untrustedGitHubContextEvents };
