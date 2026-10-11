# AgentCI Guard research site

This is the source for the static page deployed to [cryptoaxiom.net](https://cryptoaxiom.net/) on 2026-10-11 (Cloudflare Pages deployment `a145c82a-bdbc-4333-9d31-58dd85567830`). It explains the scanner and replays one synthetic fixture from public scanner commit `5c045e0469f412aecd0f9d5f32876bf10c7fc66b`. It does not upload workflows or run a live scan, and it does not report measured accuracy.

Build from this directory with `python3 build.py`. The script copies only the four files in `src/` to `dist/` and writes `BUILD_MANIFEST.json` with SHA-256 hashes. The deployed asset hashes were:

| File         | SHA-256                                                            |
| ------------ | ------------------------------------------------------------------ |
| `index.html` | `5f66c631390a18341152d6a780aac95b76b1708542a22394c9754065ac2b02b3` |
| `styles.css` | `ad9093b0efdcd64a129bf54cfb9350bc5278041d13923b0a39dca321631aa4f6` |
| `app.js`     | `3b5c28184ebdd6cf1ff38a84d817dc1a0adb6cd9b175f7e40ee5808da32248fd` |
| `_headers`   | `ef24fb2358900654f58ca9eedbb33f7f125e83dca707029f70ec8032e4daded3` |

The browser check is `node render-check.mjs` with Chrome/Chromium already listening on local DevTools port 9337. It checks 1440, 768, 390, and 320 px layouts, the illustrative buttons, internal links, browser exceptions, and external asset requests. The script writes ignored screenshots and `VISUAL_CHECKS.json`.

The original production rollback is deployment `d732b37d-480c-49c4-a73d-60cb88bef059`. Direct-upload deployment does not mean the scanner source, benchmark, or human evaluation changed; those live in the repository root. The v3 benchmark is development-only and has no human labels. A fresh repository-disjoint v4 evaluation is required before any precision or recall claim.
