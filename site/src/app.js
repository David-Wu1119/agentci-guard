'use strict';
const examples = {
 unknown: ['UNREVIEWED VERSION', 'Keep the write-token finding critical.', 'A mutable tag or an unreviewed commit does not establish the action’s authorization behavior. Verify its runtime checks; do not infer unrestricted access from the label.'],
 default: ['REVIEWED IMMUTABLE DEFAULT', 'Reduce the finding to high. Keep the review.', 'At a reviewed immutable action version, the supported default actor check reduces direct stranger-triggered exposure. Prompt, secret and permission findings still matter.'],
 bypass: ['EXPLICIT BROAD ALLOWLIST', 'The actor-gate reduction no longer applies.', 'A broad user or bot allowlist can bypass the reviewed default check. The write-token finding stays critical—even with read-only execution.']
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
