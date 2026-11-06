# Release readiness checklist

Team: **The Anomaly Syndicate**. Public source and hosting are authorized by the team leader, with confirmed contribution/asset rights and MIT for original code. Hosting still requires technical/account/cost clearance; no paid service is authorized. Only this reviewed source tree is proposed for a new repository; no original or unrelated Git history is imported.

## Source boundary

The candidate contains an explicitly reviewed source allowlist. The private staging manifest outside this source directory records every selected path, size and SHA-256, including modifications and authored release files. Original development sources, extraction provenance and archive remain separate and unchanged.

Allowed categories:

- Root README, .gitignore, .dockerignore and finalized LICENSE/NOTICE/CONTRIBUTORS; pinned, read-only CI under .github/workflows.
- Frontend source/tests/configuration, package.json and lock; the placeholder-only .env.example; two verified Latin variable fonts under src/assets/fonts with OFL notices.
- Backend Python application/tests/tools, constrained runtime/development roots, tested version constraints and exact musllinux runtime/test wheel locks.
- Browser/proxy QA source and its frozen npm manifests/lock. No installed QA packages or browser downloads.
- Current architecture, validation, dependency/license and deployment/release documentation; unmodified reproduced third-party legal texts; three specifically reviewed synthetic documentation screenshots.
- Reviewed Dockerfiles, Compose and Nginx configuration. No certificates, keys or production env file.

Excluded: original ZIPs/submission material, original README/provenance/manifests, private development/phase reports, raw security/test evidence and logs, installed packages/virtualenvs/caches/browser downloads, dist/build outputs, private photos/documents/data, databases, model/checkpoint artifacts, Git metadata and all unlisted media/files. Reproduced license texts under docs/licenses are legal material, not installed dependency code. Only the explicitly reviewed font files and synthetic README captures are approved candidate media; public distribution rights for these assets were confirmed by the team leader.

`.gitignore` and the Docker context denylist are defense in depth. They do not remove already tracked history. Re-enumerate the exact staged tree and scan again after any change; do not upload the surrounding private staging, development workspace or parent reports. A later decision to include history requires its own full secret and ownership/attribution review.

## Before GitHub publication

1. Obtain explicit public-release authorization. Verify collaborator/contribution, asset and event/submission rights. The team leader approved team-only credit; do not infer names from local machine accounts. Preserve The Anomaly Syndicate attribution.
2. Obtain a team-approved public license decision. Finalize draft notices, bundled dependency/font obligations and applicable binary/source-offer requirements. The team leader has approved MIT for original code. No dependency license is changed by that decision.
3. Verify the final source manifest and current secret scan for that exact tree. Review docs/examples/assets as well as code. Check that no Git metadata/private evidence, credentials or unapproved media is staged.
4. Refresh lock and final-image vulnerability scans, inspect SBOM/license decisions and require passing regressions for the exact release. Separate any accepted exception by ID, actual exposure, control, owner, deadline and trigger; no blanket severity suppression.
5. Select the intended team-authorized GitHub owner/name and repository visibility. Review the initial file list/README/contributor statement before any separately authorized commit/push. No repository or remote has been created by this phase.

## Before public hosting

1. Obtain explicit hosting authorization and decide provider/domain/budget/operational ownership. There is no deployed URL or paid external API requirement for this synthetic scope.
2. Validate the exact host CPU architecture, container engine, image digests, filesystem/user/network/resource controls and current base-image/OS advisories. Local Linux-amd64 containers do not prove a different cloud/ARM host.
3. Provision trusted domain certificates and renewal, exact origins/host/ingress policy, health monitoring, safe aggregate logs and rollback/disable procedures. Recheck SPA routes/cache/security headers, private paths, mutation denial and capacity rejection under real ingress.
4. Complete declared-browser/manual screen-reader, physical touch/zoom/high-contrast and retention/session restore checks; describe support accurately. Automated Axe and viewport checks do not certify accessibility or Safari/iOS behavior.
5. Review shared global capacity/fairness and add appropriate outer-edge protection. One visitor can consume shared demo read capacity; CORS is not authentication. Never introduce real customer data or refund execution into this scope.

## CI verification

After reviewing action/tool supply-chain pins, run script-disabled npm ci, Vitest, typecheck/build, full/production npm audit, hash-locked Linux backend tests, pip check/advisory scan, exact-tree secret scan and isolated browser/Axe/proxy regressions on unprivileged PR runners. Generate SBOM/notices from the actual release artifacts. No publishing token, external infrastructure or untrusted-PR secret access is needed. The publication copy includes a pinned, read-only CI workflow for tests/builds/scans; it contains no deployment or publishing credentials.

See [deployment and rollback](DEPLOYMENT.md), [validation](VALIDATION.md), [dependency status](DEPENDENCY_SECURITY.md) and [license inventory](THIRD_PARTY_LICENSES.md).
