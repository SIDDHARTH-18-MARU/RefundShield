# Dependency and artifact security

Private release-candidate review, 6 November 2026. Team: **The Anomaly Syndicate**. Scanner results are dated known-advisory checks, not proof of absence of vulnerabilities or legal permission to distribute.

## Application dependencies

The frontend keeps the previously reviewed patched lock: React Router 7.18.5, Vite 6.4.5, Vitest 4.1.12, postcss-selector-parser 6.1.5 and source-map-js 1.2.2. React remains 18.3.1 and Recharts 2.15.4. No forced audit fix, peer bypass, override, advisory ignore or blind major upgrade was applied in this release phase. Publication authorization, confirmed contributor/asset rights and the original-code MIT decision are recorded in CONTRIBUTORS.md; third-party terms are unchanged. Ordinary installs use `npm ci --ignore-scripts --no-audit --no-fund`; lifecycle scripts were inspected and disabled. Tests/build validate the selected platform's optional native binaries.

The historical npm audit's ten package entries represented eighteen unique advisory URLs with transitive propagation, not ten confirmed application attacks. The current full and production npm audit results are recorded in VALIDATION.md. Test/build servers are never production components.

The minimal HTTP runtime has five direct roots: FastAPI, Uvicorn, NumPy, pandas and NetworkX. Exact constrained transitive versions are preserved, but reload/WebSocket, test and scanner extras are excluded. The target runtime lock has 19 exact wheel versions/hashes; the separate Linux test lock has 27. `pip check` runs at build time before pip/ensurepip are removed from the deployed filesystem. No runtime package installer or migration/database is required.

Font packaging adds no npm dependency or executable script: only two WOFF2 files and their OFL texts were selected from Fontsource Variable 5.3.0 tarballs after SHA-512 integrity verification. Inter and JetBrains Mono families remain the same. The stylesheet no longer requests Google Fonts; CSP fonts/connect/scripts remain same-origin. Inline styles are retained only for existing chart/animation behavior.

## Container findings and disposition

Package-only scans do not clear an OS image. The first Debian 12 API candidate reported 247 vulnerability/package entries (including two critical entries and eight vendored Python-tool entries); a Debian 13 comparison still had substantial inherited findings. Entries can repeat the same CVE across binary packages and can include source-package/build-only applicability limitations. These were not reported as 247 exploitable application paths.

The selected target is a digest-pinned official Python 3.14.10 Alpine image with binary musllinux wheels at the **same application package versions**. Full backend/scoring tests were executed on that ABI. The final runtime removes unused pip/ensurepip after installation checks; original reports remain private evidence. No SBOM was removed to hide findings and no scanner rule was suppressed. Official Nginx Alpine and Node Alpine builder digests are also pinned. Current final-image OS/language scan results, exact environment and unresolved limits are recorded in VALIDATION.md.

The OS/base image, compiled wheels and license contents must be reviewed again on a digest, Python, architecture or package update. A clean installed-package scan does not cover the original archive, developer host, Docker Desktop/kernel, browser, cloud provider or future dependency resolutions. Build-time tools and base notices also need appropriate distribution/supply-chain review.

## Licenses and maintenance

[Draft third-party inventory](THIRD_PARTY_LICENSES.md) covers the conservative 53-package production npm closure and the 19-package installed Linux runtime. Reproduced license texts are retained under docs/licenses and in `/licenses` in the images. Source examples include no real customer data or private submission assets.

Review the full NumPy/OpenBLAS/LAPACK/GCC runtime exception notices, pandas bundled notices, PSF/tzdata terms, caniuse-lite's build-data attribution and the distribution/base-image license obligations. QA's axe-core packages use MPL-2.0 and Playwright uses Apache-2.0; QA is not deployed. victory-vendor omitted a root license in its npm artifact, so the matching upstream release MIT text was verified at its immutable commit and retained alongside D3 closure notices. Font assets retain OFL-1.1 texts and are unmodified. The team-approved MIT license applies only to original project code. These reviews do not replace third-party binary/source-offer obligations.

Recharts 2 and test-only whatwg-encoding are deprecated upstream. The passing backend suite also reports a Starlette/httpx test-client deprecation. No current advisory requires blind Recharts 3/jsdom/httpx2 migration; treat those as separate regression-tested maintenance work, with an owner and a new-advisory/support-change trigger.

## Refresh commands

Run npm audit (full and --omit=dev) against committed frontend/QA locks. Use a separately installed, current pip-audit with strict hash-locked runtime requirements; do not install scanners into the production image. Scan locally built images with current Trivy OS/language data and inventory their full licenses. Scan the exact source tree using current Gitleaks with full redaction and no inline-ignore bypass; scan history separately if any is later proposed. Preserve raw logs/JSON, scanner versions/checksums and artifact hashes privately. Never include scanner evidence, local TLS keys or private provenance in the public source tree.
