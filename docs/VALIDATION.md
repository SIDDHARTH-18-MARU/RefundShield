# Release-candidate validation

6 November 2026. Team: **The Anomaly Syndicate**. Private local validation only; no public source release or hosting. The detailed private phase report contains command outputs, checksums and failure chronology. This source document summarizes results without distributing raw evidence.

## Executed final results

| Check | Actual result |
|---|---|
| Linux backend/security suite | **156 passed**, 0 skipped; one Starlette/httpx test-client deprecation; final run 5.61s |
| Frontend Vitest | **53 passed**, 0 failed/pending, including three modal focus regressions |
| TypeScript and production builds | Passed; Windows Vite bundling 6.74s; final Linux static bundling 5.85s |
| webkit 27.2 | **49/49** workflows; **16** Axe audits, 0 violations; 0 page errors; 1 expected console503 from injected failure/retry |
| edge 156.0.4314.58 | **49/49** workflows; **16** Axe audits, 0 violations; 0 page errors; 1 expected console503 from injected failure/retry |
| chrome 157.0.8103.39 | **49/49** workflows; **16** Axe audits, 0 violations; 0 page errors; 1 expected console503 from injected failure/retry |
| firefox 159.0 | **49/49** workflows; **16** Axe audits, 0 violations; 0 page errors; 0 expected console503 from injected failure/retry |
| Browser totals | **196 workflow checks**, **64 Axe audits**, no reported automated accessibility violations |
| Fonts/CSP | 8 routes passed; local font responses200; 0 external requests, 0 CSP violations, 0 console errors |
| HTTPS/proxy/API runtime probes | **8/8** check groups passed |
| Current dependency scans | Full/production frontend and QA npm audit0; runtime19 and test27 pip-audit0; final API/web/test image OS/language Trivy findings0 |

Cached-image process restart reached healthy services in **11.531s**. The local uncached/cached analysis probe measured **119.53ms / 20.88ms**. The fixed 64-request, 32-worker probe returned **8 HTTP200 and 56 HTTP429**, no5xx, with Retry-After. Observed cgroup peaks during these post-restart probes were **103.67MiB API / 8.91MiB web**, under the configured1GiB/128MiB caps. These measurements demonstrate bounded shedding in this local test, not sustained throughput, full-cache memory sizing, public-user capacity or a cloud SLA.

Safe shutdown was observed: web exit0; API exit143 after logged application shutdown completion, with no OOM or forced-kill evidence. Production keys, public certificate trust/renewal, external ingress and a cloud host were not tested.

Tools: Python3.14.10 on Linux-amd64 Alpine3.24.4, Docker29.9.2, Compose5.6.1, Node22.23.4/npm10.9.9, Playwright1.65.0, Axe4.14.0, pip-audit2.10.1, Trivy0.76.2 and Gitleaks8.30.1. Scanner downloads were verified against published checksums; private manifests retain exact source/image evidence.

Visual inspection sampled desktop dashboard/investigations/accounts/account detail/threshold/network/scenarios, mobile overview/threshold/network and dark threshold/network. Synthetic notices remained visible; tables/graphs use intentional internal scrolling/zoom. Three selected page-only synthetic captures appear in the README; all raw screenshots, exports, scan logs and private provenance remain outside source.

Initial failures were preserved: private-network-only proxy was not host-reachable; external fonts conflicted with CSP during accessibility inspection; burst16 rejected a valid sweep-plus-comparison; WebKit escaped the modal Tab trap; browser loading/download harness races and two test-only type/HTML assumptions failed. Corrections were narrowly scoped and rerun. Final results above are executed outcomes, not historical substitutions.


## Scope

The full backend suite covers unchanged deterministic scoring/config/generator/domain behavior, mutation denial, scenario/record/input validation, origins, capacity and safe errors. Frontend unit/integration tests cover investigation/account/chart/network interactions and the bounded tab-local workspace. Browser checks exercise live container APIs, routing, search, actions/notes, visitor/scenario isolation, reset/recovery, JSON/CSV exports, threshold sweep/comparison, failure/retry, keyboard navigation, three viewport widths and both themes.

The font/CSP check separately asserts loaded local font faces, zero external HTTP requests, no CSP violations and no unexpected console errors across all eight routes. Proxy checks exercise HTTPS/deep links/security headers/private-path denial, invalid inputs, mutation denial, origins and bounded capacity. Process lifecycle checks record startup, restart, shutdown and actual resource settings.

## Limits

Browser automation uses isolated contexts and a localhost-only self-signed TLS exception. That is not validation of a trusted public domain, certificate renewal or cloud ingress. Windows Playwright WebKit is an engine compatibility test, not Safari/iOS certification. Axe's selected tags cover automated WCAG2A/AA/2.1AA rules on tested routes/themes; they do not certify complete accessibility.

Not performed by automation: human screen reader, physical touch/pinch zoom, browser zoom/high-contrast/forced-color usability, real mobile devices, session restoration/tab duplication retention semantics, prolonged/distributed denial-of-service testing, cloud cold starts/ARM targets, real fraud data or accuracy validation. These remain explicit support/release decisions. No real customer information or actual refunds were used.
