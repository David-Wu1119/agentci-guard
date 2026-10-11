export function sameUnit(annotation, candidate) {
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

export function relevantDiagnostics(annotation, result) {
  const writeTokenRules = [
    "agentci/untrusted-ai-write-token",
    "agentci/gated-ai-write-token",
  ];
  const permissionDependent = [
    ...writeTokenRules,
    "agentci/broad-write-permissions",
  ];
  return result.diagnostics.filter((diagnostic) => {
    if (diagnostic.file !== annotation.workflow_file) return false;
    if (diagnostic.job && diagnostic.job !== annotation.job_id) return false;
    if (diagnostic.code === "agentci/analysis-agent-event-unsupported") {
      return false;
    }
    if (
      diagnostic.code === "agentci/analysis-permissions-unknown" &&
      !permissionDependent.includes(annotation.rule_id)
    ) {
      return false;
    }
    if (
      diagnostic.code === "agentci/analysis-checkout-protection-unknown" &&
      annotation.rule_id !== "agentci/unsafe-checkout"
    ) {
      return false;
    }
    if (
      [
        "agentci/analysis-agent-tool-fetch-unknown",
        "agentci/analysis-agent-implicit-ingestion-unknown",
      ].includes(diagnostic.code) &&
      !writeTokenRules.includes(annotation.rule_id)
    ) {
      return false;
    }
    return true;
  });
}

export function predict(annotation, result, agentDetectionTask) {
  const positive =
    annotation.rule_id === agentDetectionTask
      ? result.agent_usages.some((usage) => sameUnit(annotation, usage))
      : result.findings.some(
          (finding) =>
            finding.rule_id === annotation.rule_id &&
            sameUnit(annotation, finding),
        );
  if (positive) return "positive";
  if (
    annotation.rule_id === "agentci/gated-ai-write-token" &&
    result.findings.some(
      (finding) =>
        finding.rule_id === "agentci/untrusted-ai-write-token" &&
        sameUnit(annotation, finding),
    )
  ) {
    return "negative";
  }
  return relevantDiagnostics(annotation, result).length > 0
    ? "unknown"
    : "negative";
}
