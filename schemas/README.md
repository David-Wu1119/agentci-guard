# Vendored standards schemas

`sarif-schema-2.1.0.json` is the unmodified OASIS SARIF 2.1.0 Errata 01
Committee Specification 01 JSON Schema.

- Source:
  `https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json`
- Retrieved: 2026-07-25
- SHA-256:
  `c3b4bb2d6093897483348925aaa73af03b3e3f4bd4ca38cef26dcb4212a2682e`
- Declared meta-schema: JSON Schema draft-04

`scripts/verify-sarif-schema.mjs` verifies this checksum before compiling the
schema and validating AgentCI Guard output. The separate project-specific
verifier checks rule metadata, severity mapping, reachable-event properties,
relative artifact locations, and meaningful line numbers.
