export function unitId(caseId, scope, jobId, stepIndex, task) {
  return [caseId, scope, jobId ?? "-", stepIndex ?? "-", task]
    .map((part) => encodeURIComponent(String(part)))
    .join("|");
}
