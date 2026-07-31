# AgentCI Guard Threat Model

AgentCI Guard is an experimental static linter for GitHub Actions workflows
that invoke AI coding agents. It identifies review-worthy patterns within a
documented subset of workflow semantics. It does not prove that a workflow is
vulnerable, exploitable, or secure.

## Protected assets

- Repository contents, pull requests, issues, discussions, packages, and
  deployments writable through `GITHUB_TOKEN`.
- Provider credentials and other secrets exposed to a job.
- Trusted base-branch code and release artifacts.
- Maintainer attention and the integrity of automated review output.

## Adversary

The modeled adversary can influence public GitHub event data such as pull
request titles/bodies/head refs, issue or discussion content, comments, review
text, and selected commit or branch metadata. The model does not assume the
adversary can change trusted base-branch workflow YAML before the run.

## In-scope trust boundaries

- `.github/workflows/*.yml` and `.yaml` files.
- Workflow, job, and step environment precedence.
- Workflow and job token permissions, including explicit absence and unknown
  repository defaults.
- Event-specific job and step reachability for the documented expression
  subset.
- AI Action and AI CLI identification.
- Direct untrusted GitHub context use in an AI step.
- Secret references, explicit command capability, and sensitive writes.
- `pull_request_target` head/fork checkout and the documented
  `actions/checkout` unsafe-PR protection boundary.
- Local reusable workflows in the same snapshot; explicit incomplete analysis
  for unresolved remote or missing calls.
- YAML parse failures and source locations.

## Unsupported or incomplete semantics

- Arbitrary data flow through scripts, generated files, composite Actions, or
  external services.
- Runtime behavior of downloaded Actions and model providers.
- Full GitHub expression language, matrices, dynamic object access, and
  authorization logic hidden in scripts.
- Organization or repository permission defaults unless supplied through
  `agentci.config.json`.
- Remote reusable-workflow bodies.
- Runtime sandboxing, network policy, and secret redaction.
- Whether a model follows or resists a prompt injection.
- Non-GitHub CI systems.

Unsupported event expressions, ambiguous checkout protection, permission
defaults, reusable-workflow boundaries, and parse failures produce diagnostics and
`analysis_complete=false`. A diagnostic is not a finding, but a clean-looking
finding list with a diagnostic is not a closed analysis.

## Expected failure modes

- A wrapper or script can hide agent use, producing an agent-identification
  false negative.
- A provider credential or product token can resemble agent use, producing a
  false positive.
- Complex conditions can reduce decision coverage through abstention.
- Static permission and environment resolution can disagree with runtime
  policy or generated configuration.
- A matched pattern can be mitigated by author checks, approval gates, output
  allowlists, or isolation the scanner does not model.
- A dangerous workflow can use a source, sink, capability, or permission not
  represented by the eight rules.

## Interpretation

Use “finding,” “pattern match,” “scanner rating,” “supported semantics,” and
“analysis incomplete.” Do not describe a finding as a confirmed exploit or a
clean result as a secure workflow.

No precision or recall claim is valid until the frozen benchmark has public
human labels, independent review, adjudication, and generated error analysis.
The qualification targets in the benchmark are wording gates for “calibrated
experimental linter,” not safety guarantees.
