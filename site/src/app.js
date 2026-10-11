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
const findings = document.getElementById('scan-findings');
const diagnostics = document.getElementById('scan-diagnostics');
const scanButton = document.getElementById('scan-button');
let inputRevision = 0;

function resetResults(message) {
  heading.textContent = 'Ready to scan';
  status.textContent = message;
  error.hidden = true;
  error.textContent = '';
  output.hidden = true;
  findings.replaceChildren();
  diagnostics.replaceChildren();
}

function showError(message) {
  resetResults('The scan did not run.');
  heading.textContent = 'Scan not completed';
  error.textContent = message;
  error.hidden = false;
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
  if (!Array.isArray(result?.findings) || !Array.isArray(result?.diagnostics) || typeof result.analysis_complete !== 'boolean') {
    throw new Error('The scanner returned an invalid result.');
  }
  findings.replaceChildren();
  diagnostics.replaceChildren();

  for (const finding of result.findings) {
    const item = document.createElement('li');
    const title = document.createElement('h5');
    title.textContent = `${finding.severity.toUpperCase()} · ${finding.title}`;
    item.append(title);
    addDetail(item, 'Rule', finding.rule_id);
    addDetail(item, 'Location', `${finding.file}${finding.line ? `:${finding.line}` : ''}`);
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
    addDetail(item, 'Location', `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ''}`);
    addDetail(item, 'Message', diagnostic.message);
    diagnostics.append(item);
  }
  if (!result.diagnostics.length) {
    const item = document.createElement('li');
    item.textContent = 'No diagnostics reported for this file.';
    diagnostics.append(item);
  }

  const count = result.findings.length;
  heading.textContent = `${count} finding${count === 1 ? '' : 's'}`;
  status.textContent = `Scanner v${scanWorkflow.version}: ${result.analysis_complete ? 'analysis complete' : 'analysis incomplete'} for this one-file input.`;
  completeness.textContent = result.analysis_complete
    ? 'analysis_complete: true. This covers only supported static checks for the supplied file; it does not validate the full GitHub Actions schema or guarantee security.'
    : 'analysis_complete: false. The diagnostics below identify unsupported or failed analysis; do not treat this as a clean scan.';
  error.hidden = true;
  output.hidden = false;
  heading.focus();
}

yaml.addEventListener('input', () => {
  inputRevision++;
  resetResults('Input changed. Scan again to see current results.');
});

document.getElementById('load-example').addEventListener('click', () => {
  inputRevision++;
  yaml.value = document.querySelector('#research pre code').textContent;
  fileInput.value = '';
  resetResults('Published synthetic sample loaded. Select Scan workflow to analyze it.');
  yaml.focus();
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const revision = ++inputRevision;
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
    status.textContent = `${file.name} loaded locally. Select Scan workflow to analyze it.`;
  } catch (cause) {
    if (revision !== inputRevision) return;
    showError(cause instanceof Error ? cause.message : 'Could not read the selected file.');
    fileInput.value = '';
  } finally {
    scanButton.disabled = false;
    fileInput.disabled = false;
  }
});

scanButton.addEventListener('click', () => {
  const raw = yaml.value;
  if (!raw.trim()) return showError('Paste workflow YAML or choose a file before scanning.');
  if (raw.length > maxChars) return showError(`Workflow is too large. The limit is ${maxChars.toLocaleString()} characters.`);
  if (typeof scanWorkflow !== 'function') return showError('The scanner did not load. Use the CLI or GitHub Action instead.');
  try {
    renderResult(scanWorkflow(raw));
  } catch (cause) {
    showError(cause instanceof Error ? cause.message : 'The scanner could not analyze this workflow.');
  }
});

if (typeof scanWorkflow !== 'function') showError('The scanner did not load. Use the CLI or GitHub Action instead.');

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
