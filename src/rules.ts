import type { Severity } from "./types.js";

export type RuleDefinition = {
  id: string;
  title: string;
  severity: Severity;
  why: string;
  fix: string[];
};

export const RULES: Record<string, RuleDefinition> = {
  "agentci/untrusted-ai-write-token": {
    id: "agentci/untrusted-ai-write-token",
    title:
      "Untrusted event content can reach an AI agent with write permissions",
    severity: "critical",
    why: "An attacker can place prompt-injection text in a PR, issue, or comment. If that text reaches an AI agent with repository write permissions, the agent can be induced to modify code, comments, workflows, or releases.",
    fix: [
      "Do not run privileged AI agents on untrusted triggers.",
      "Use read-only GITHUB_TOKEN permissions for untrusted events.",
      "Require maintainer approval before running the agent.",
      "Sanitize and summarize untrusted content before passing it to an agent.",
    ],
  },
  "agentci/pull-request-target-ai": {
    id: "agentci/pull-request-target-ai",
    title: "AI agent runs on pull_request_target",
    severity: "critical",
    why: "pull_request_target runs in the base repository security context and can expose write tokens or secrets to workflows influenced by an untrusted pull request.",
    fix: [
      "Use pull_request with read-only permissions for untrusted code.",
      "Split analysis into a read-only job and a separate maintainer-approved write job.",
      "Avoid checking out untrusted PR head code in pull_request_target.",
    ],
  },
  "agentci/ai-with-secrets": {
    id: "agentci/ai-with-secrets",
    title: "AI agent job has access to secrets",
    severity: "high",
    why: "Secrets mounted into an AI-agent job can be exfiltrated if untrusted prompt content influences tool use, shell commands, or generated output.",
    fix: [
      "Do not expose secrets to agent jobs that process untrusted content.",
      "Use short-lived scoped tokens.",
      "Move secret-bearing actions behind manual approval.",
    ],
  },
  "agentci/untrusted-input-in-prompt": {
    id: "agentci/untrusted-input-in-prompt",
    title:
      "Untrusted GitHub event content is passed into an AI prompt or command",
    severity: "high",
    why: "PR bodies, issue bodies, comments, branch names, and commit messages are attacker-controlled in common workflows and can contain prompt-injection instructions.",
    fix: [
      "Avoid inserting raw GitHub event text into prompts.",
      "Use structured extraction and length limits.",
      "Add prompt-injection filtering before AI execution.",
      "Run the agent with read-only permissions.",
    ],
  },
  "agentci/ai-shell-access": {
    id: "agentci/ai-shell-access",
    title: "AI agent has shell or arbitrary command access",
    severity: "high",
    why: "Shell access allows a compromised agent prompt to inspect the workspace, call network endpoints, or alter build artifacts.",
    fix: [
      "Disable shell tools for untrusted events.",
      "Run in a sandbox with no secrets.",
      "Restrict network and filesystem access.",
    ],
  },
  "agentci/broad-write-permissions": {
    id: "agentci/broad-write-permissions",
    title: "Workflow grants broad write permissions near AI usage",
    severity: "medium",
    why: "Broad write scopes increase blast radius if an AI-agent step is influenced by untrusted input.",
    fix: [
      "Set default permissions to read-only.",
      "Grant write scopes only in narrowly scoped jobs.",
      "Prefer job-level permissions over workflow-level write permissions.",
    ],
  },
  "agentci/unpinned-ai-action": {
    id: "agentci/unpinned-ai-action",
    title: "AI-related action is not pinned to a commit SHA",
    severity: "medium",
    why: "Tag-pinned third-party actions can change over time. AI-agent actions often receive privileged context, so supply-chain drift matters.",
    fix: [
      "Pin third-party actions to full commit SHAs.",
      "Review updates explicitly.",
      "Prefer first-party or internally mirrored actions for privileged jobs.",
    ],
  },
  "agentci/unsafe-checkout": {
    id: "agentci/unsafe-checkout",
    title:
      "Workflow checks out untrusted pull request head in a privileged context",
    severity: "high",
    why: "Checking out attacker-controlled code in a privileged workflow can let malicious build scripts or configuration affect the agent job.",
    fix: [
      "Do not checkout PR head code inside pull_request_target.",
      "Use read-only analysis jobs.",
      "Disable install/build scripts before trust is established.",
    ],
  },
};

export const SEVERITY_ORDER: Severity[] = ["low", "medium", "high", "critical"];
