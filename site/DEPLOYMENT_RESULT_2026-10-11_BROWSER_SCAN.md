# Browser-local scanner deployment — 2026-10-11

Source: local branch `codex/guard-research-site-20261011`, commit `102cc92a0a24e69c67acf95c03dd2a98c97fca23` (not pushed to GitHub). Project: Cloudflare Pages `axiom-console`.

- Preview: `f3b2aa55-9bb9-4a71-9c1c-43c0199c7607` at <https://f3b2aa55.axiom-console.pages.dev/>.
- Production: `dcec7408-ccaa-4f35-be0c-272b5142f0c4` at <https://cryptoaxiom.net/> and <https://dcec7408.axiom-console.pages.dev/>.
- Previous production rollback: `a145c82a-bdbc-4333-9d31-58dd85567830` at <https://a145c82a.axiom-console.pages.dev/>.

Build: `pnpm site:check`; deploy: `npx --yes wrangler@4.147.0 pages deploy site/dist --project-name axiom-console --branch main`. The six allowlisted assets were built from the source commit. Production hashes matched the local build:

| Asset                      | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `index.html`               | `11c00829d5b6ce32b26f0be8674f5864d8aa94ba49c400b6664ac251c62ceb61` |
| `styles.css`               | `87f979474d79725c047a4dc7ee419955abc0b30c4bc5633bcf696522e9efdf5a` |
| `app.js`                   | `984a97f47973a47e61b6581e973bace43bacea84853547364a94af5a11d34d81` |
| `scanner-browser.js`       | `93eef1d2522d9226dec3e9c3d1b5ac1e87e6a2abaf8c430f78c24e49d5774343` |
| `THIRD_PARTY_LICENSES.txt` | `18a517282fdee4bcbca78d5e85606966ea1fba6a00c05267099e770deeac7326` |
| `_headers`                 | `3923d4b3e9fd41486954f75ffca24674c066f359782e74e8edcc6565b1d88928` |

Verification: `pnpm check` passed under Node 22 with 239 tests; `pnpm site:check` matched the Node scanner on 46 adversarial YAML files; `node site/render-check.mjs` passed at five viewport widths and tested sample, error states, file input, and keyboard focus. The production domain returned HTTP 200 with CSP `connect-src 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`; it had no `X-Robots-Tag: noindex`. A real production-browser run of the pinned synthetic sample returned three expected findings, no diagnostics, and `analysis_complete: true` for the one-file input.

Limits: the browser interface is single-file only and not a GitHub Actions schema validator or proof of security. It does not upload YAML or collect user feedback. The deployment is not evidence of scanner precision/recall, external adoption, or a production security gate; no human labels exist. The source branch still needs a reviewed public PR before an outsider can rebuild this exact website from GitHub.
