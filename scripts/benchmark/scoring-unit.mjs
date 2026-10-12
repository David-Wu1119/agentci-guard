// Development scoring only; formal v4 requires locked per-rule witnesses and unit projection.
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
  const inputDependent = [
    ...writeTokenRules,
    "agentci/untrusted-input-in-prompt",
  ];
  return result.diagnostics.filter((diagnostic) => {
    if (diagnostic.file !== annotation.workflow_file) return false;
    if (diagnostic.job && diagnostic.job !== annotation.job_id) return false;
    if (
      annotation.scope === "step" &&
      diagnostic.step_index !== undefined &&
      diagnostic.step_index !== annotation.step_index
    ) {
      return false;
    }
    if (diagnostic.code === "agentci/analysis-agent-event-unsupported") {
      return false;
    }
    if (
      diagnostic.code === "agentci/analysis-agent-event-unknown" &&
      annotation.rule_id !== "agentci/agent-usage"
    ) {
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
        "agentci/analysis-remote-agent-capability-unknown",
      ].includes(diagnostic.code) &&
      !writeTokenRules.includes(annotation.rule_id)
    ) {
      return false;
    }
    if (
      diagnostic.code === "agentci/analysis-run-dataflow-unknown" &&
      !inputDependent.includes(annotation.rule_id)
    ) {
      return false;
    }
    if (
      [
        "agentci/analysis-output-provenance-unknown",
        "agentci/analysis-matrix-provenance-unknown",
        "agentci/analysis-reusable-input-provenance-unknown",
      ].includes(diagnostic.code) &&
      !writeTokenRules.includes(annotation.rule_id)
    ) {
      return false;
    }
    return true;
  });
}

export function predict(annotation, result, agentDetectionTask) {
  const candidates =
    annotation.rule_id === agentDetectionTask
      ? result.agent_usages.filter((usage) => sameUnit(annotation, usage))
      : result.findings.filter(
          (finding) =>
            finding.rule_id === annotation.rule_id &&
            sameUnit(annotation, finding),
        );
  if (candidates.some(confirmedEvent)) return "positive";
  const ungated =
    annotation.rule_id === "agentci/gated-ai-write-token"
      ? result.findings.filter(
          (finding) =>
            finding.rule_id === "agentci/untrusted-ai-write-token" &&
            sameUnit(annotation, finding),
        )
      : [];
  if (ungated.some(confirmedEvent)) return "negative";
  if (candidates.length > 0 || ungated.length > 0) return "unknown";
  return relevantDiagnostics(annotation, result).length > 0
    ? "unknown"
    : "negative";
}

function confirmedEvent(candidate) {
  const uncertain = candidate.uncertain_reachable_events;
  return (
    !uncertain?.length ||
    (candidate.reachable_events ?? []).some(
      (event) => !uncertain.includes(event),
    )
  );
}
