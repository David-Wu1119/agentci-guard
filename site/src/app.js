'use strict';

const scanWorkflow = window.agentciScanWorkflow;
const maxChars = scanWorkflow?.maxChars ?? 250000;
const yaml = document.getElementById('workflow-yaml');
const fileInput = document.getElementById('workflow-file');
const heading = document.getElementById('scan-results-heading');
const status = document.getElementById('scan-status');
const error = document.getElementById('scan-error');
const output = document.getElementById('scan-output');
const completeness = document.getElementById('scan-completeness');
const agentUsages = document.getElementById('scan-agent-usages');
const findings = document.getElementById('scan-findings');
const diagnostics = document.getElementById('scan-diagnostics');
const scanButton = document.getElementById('scan-button');
let inputRevision = 0;
let sourceLabel = 'pasted YAML';

function resetResults(message) {
  heading.textContent = 'Ready to scan';
  status.textContent = message;
  error.hidden = true;
  error.textContent = '';
  output.hidden = true;
  agentUsages.replaceChildren();
  findings.replaceChildren();
  diagnostics.replaceChildren();
}

function showError(message, focusHeading = true) {
  resetResults('The scan did not run.');
  heading.textContent = 'Scan not completed';
  error.textContent = message;
  error.hidden = false;
  if (focusHeading) {
    heading.focus();
    heading.scrollIntoView({ behavior: 'instant', block: 'center' });
  }
}

function addDetail(item, label, value) {
  if (value === undefined || value === '') return;
  const line = document.createElement('p');
  const name = document.createElement('strong');
  name.textContent = `${label}: `;
  line.append(name, document.createTextNode(String(value)));
  item.append(line);
}

function renderResult(result) {
  if (!Array.isArray(result?.agent_usages) || !Array.isArray(result.findings) || !Array.isArray(result.diagnostics) || typeof result.analysis_complete !== 'boolean') {
    throw new Error('The scanner returned an invalid result.');
  }
  agentUsages.replaceChildren();
  findings.replaceChildren();
  diagnostics.replaceChildren();

  for (const usage of result.agent_usages) {
    const item = document.createElement('li');
    const title = document.createElement('h5');
    title.textContent = `${usage.job} / ${usage.step}`;
    item.append(title);
    addDetail(item, 'Virtual location', `${usage.file}:${usage.line}`);
    addDetail(item, 'Step index', usage.step_index);
    addDetail(item, 'Evidence', usage.evidence);
    addDetail(item, 'Reachable events', usage.reachable_events.join(', '));
    agentUsages.append(item);
  }
  if (!result.agent_usages.length) {
    const item = document.createElement('li');
    item.textContent = result.analysis_complete
      ? 'No supported agent-use step detected in this file. Indirect or unsupported agents may be missed.'
      : 'No agent-use step confirmed; analysis is incomplete. Review diagnostics.';
    agentUsages.append(item);
  }

  for (const finding of result.findings) {
    const item = document.createElement('li');
    const title = document.createElement('h5');
    title.textContent = `${finding.severity.toUpperCase()} · ${finding.title}`;
    item.append(title);
    addDetail(item, 'Rule', finding.rule_id);
    addDetail(item, 'Virtual location', `${finding.file}${finding.line ? `:${finding.line}` : ''}`);
    addDetail(item, 'Job', finding.job);
    addDetail(item, 'Step index', finding.step_index);
    addDetail(item, 'Finding', finding.message);
    addDetail(item, 'Why', finding.why);
    addDetail(item, 'Evidence', finding.evidence);
    addDetail(item, 'Suggested fix', finding.fix?.join(' '));
    findings.append(item);
  }
  if (!result.findings.length) {
    const item = document.createElement('li');
    item.textContent = result.analysis_complete
      ? 'No findings under the supported single-file checks. This is not proof of safety.'
      : 'No findings, but analysis is incomplete. Review diagnostics before drawing any conclusion.';
    findings.append(item);
  }

  for (const diagnostic of result.diagnostics) {
    const item = document.createElement('li');
    addDetail(item, 'Diagnostic', `${diagnostic.severity.toUpperCase()} · ${diagnostic.code}`);
    addDetail(item, 'Virtual location', `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ''}`);
    addDetail(item, 'Job', diagnostic.job);
    addDetail(item, 'Step index', diagnostic.step_index);
    addDetail(item, 'Message', diagnostic.message);
    diagnostics.append(item);
  }
  if (!result.diagnostics.length) {
    const item = document.createElement('li');
    item.textContent = 'No diagnostics reported for this file.';
    diagnostics.append(item);
  }

  const count = result.findings.length;
  const findingLabel = `${count} finding${count === 1 ? '' : 's'}`;
  heading.textContent = result.analysis_complete
    ? `${findingLabel} for ${sourceLabel}`
    : `Analysis incomplete${count ? ` — ${findingLabel}` : ''} for ${sourceLabel}`;
  const findingStatus = count ? `${findingLabel}; ` : '';
  const pageSource = document.querySelector('#scanner-source a')?.textContent ?? document.getElementById('scanner-source').textContent.trim();
  status.textContent = `${result.agent_usages.length} recognized agent-use step${result.agent_usages.length === 1 ? '' : 's'}; ${findingStatus}${result.analysis_complete ? 'analysis complete' : 'analysis incomplete'} for ${sourceLabel}. Browser scanner trial (page build source: ${pageSource}; scanner and renderer scripts checked by the browser; compare separately with the published Action/CLI). Locations below are virtual scanner paths.`;
  completeness.textContent = result.analysis_complete
    ? 'analysis_complete: true. This covers only supported static checks for the supplied file; it does not validate the full GitHub Actions schema or guarantee security.'
    : 'analysis_complete: false. The diagnostics below identify unsupported or failed analysis; do not treat this as a clean scan.';
  error.hidden = true;
  output.hidden = false;
  heading.focus();
  heading.scrollIntoView({ behavior: 'instant', block: 'start' });
}

yaml.addEventListener('input', () => {
  inputRevision++;
  sourceLabel = 'pasted YAML';
  fileInput.value = '';
  resetResults('Input changed. Scan again to see current results.');
});

document.getElementById('load-example').addEventListener('click', () => {
  const sample = document.querySelector('#research pre code').textContent;
  const hasDifferentInput = (yaml.value.trim() && yaml.value !== sample) || fileInput.files?.length;
  if (hasDifferentInput && !window.confirm('Replace the current workflow or selected file with the published sample?')) return;
  inputRevision++;
  yaml.value = sample;
  sourceLabel = 'published sample';
  fileInput.value = '';
  resetResults('Published synthetic sample loaded. Select Scan workflow to analyze it.');
  yaml.focus();
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (yaml.value.trim() && !window.confirm('Replace the current workflow with the selected file?')) {
    fileInput.value = '';
    return;
  }
  const revision = ++inputRevision;
  const restoreFileFocus = document.activeElement === fileInput;
  scanButton.disabled = true;
  fileInput.disabled = true;
  resetResults('Reading the selected file locally.');
  if (file.size > maxChars) {
    showError(`File is too large. Choose a YAML file no larger than ${maxChars.toLocaleString()} bytes.`);
    fileInput.value = '';
    scanButton.disabled = false;
    fileInput.disabled = false;
    return;
  }
  try {
    const raw = await file.text();
    if (raw.length > maxChars) throw new RangeError('File has too many characters.');
    if (revision !== inputRevision) return;
    yaml.value = raw;
    sourceLabel = file.name;
    status.textContent = `${file.name} loaded locally. Select Scan workflow to analyze it.`;
  } catch (cause) {
    if (revision !== inputRevision) return;
    showError(cause instanceof Error ? cause.message : 'Could not read the selected file.');
    fileInput.value = '';
  } finally {
    scanButton.disabled = false;
    fileInput.disabled = false;
    if (restoreFileFocus && revision === inputRevision && error.hidden && document.activeElement === document.body) fileInput.focus();
  }
});

scanButton.addEventListener('click', () => {
  const raw = yaml.value;
  if (!raw.trim()) return showError('Paste workflow YAML or choose a file before scanning.');
  if (raw.length > maxChars) return showError(`Workflow is too large. The limit is ${maxChars.toLocaleString()} characters.`);
  if (typeof scanWorkflow !== 'function') return showError('The scanner did not load. Refresh the page, or use the CLI or GitHub Action instead.');
  try {
    renderResult(scanWorkflow(raw));
  } catch (cause) {
    showError(cause instanceof Error ? cause.message : 'The scanner could not analyze this workflow.');
  }
});

if (typeof scanWorkflow !== 'function') showError('The scanner did not load. Refresh the page, or use the CLI or GitHub Action instead.', false);

const examples = {
  unknown: ['UNREVIEWED VERSION', 'Verify the gate before reducing risk.', 'A mutable tag or an unreviewed commit does not establish the Action’s authorization behavior. The scanner reports action pinning separately; inspect the deployed version before relying on its gate.'],
  default: ['REVIEWED DEFAULT', 'The actor gate has a narrow effect.', 'A reviewed Action can reduce exposure only when its default check covers the trigger and every modeled input belongs to that checked actor. Parent Issue or PR content may have another author.'],
  bypass: ['EXPLICIT BROAD ALLOWLIST', 'The actor-gate reduction no longer applies.', 'allowed_non_write_users requires an explicit github_token to admit non-write users; allowed_bots can also bypass the default check. Review the actual token and input source.']
};
for (const button of document.querySelectorAll('[data-case]')) {
  button.addEventListener('click', () => {
    const example = examples[button.dataset.case];
    for (const other of document.querySelectorAll('[data-case]')) other.setAttribute('aria-pressed', String(other === button));
    document.getElementById('case-label').textContent = example[0];
    document.getElementById('case-title').textContent = example[1];
    document.getElementById('case-copy').textContent = example[2];
  });
}
