export function renderPilotSources(cases) {
  const rows = [
    "# Frozen workflow sources",
    "",
    "The packet contains only the exact development snapshots identified below.",
    "",
    "| Case | Repository | Commit | Workflow | SPDX | Frozen source |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const item of cases) {
    rows.push(
      `| ${item.case_id} | [${item.repository}](${item.repository_url}) | \`${item.source_commit}\` | \`${item.source_path}\` | \`${item.license}\` | [source](${item.source_url}) |`,
    );
  }
  return `${rows.join("\n")}\n`;
}
