# Production candidate and local validation

Team: **The Anomaly Syndicate**. The team leader authorized public hosting subject to technical and account/cost gates. This two-container configuration was tested locally; no public endpoint or live URL has been provisioned. Provider-specific adaptation requires separate validation.

## Topology and reproducibility

The web image serves only Vite's compiled static output through non-root Nginx. HTTPS `/api/` requests proxy to a separate, non-root FastAPI container on an **internal-only** analysis network. Only the web container also joins an ingress network; this is required for Docker's loopback port publishing. The API has no published host port. Local validation binds web HTTPS to `127.0.0.1:8443`.

`deploy/Dockerfile.api` pins the official Python 3.14.10 Alpine image by SHA-256. The runtime's 19 installed application/transitive packages use exact binary-wheel hashes from `backend/requirements-runtime-linux.lock`; its target is **Linux amd64, CPython 3.14, musllinux**. These hashes do not form a Windows, macOS, ARM or glibc wheel lock. NumPy/pandas/Pydantic Core wheels must be re-resolved, reviewed, scanned and tested for a different target. No source builds, compiler toolchain, reload/WebSocket extras or test packages are installed in production. `pip check` runs during construction; pip and ensurepip are then removed from the final API filesystem because installation is not a runtime function.

The static build uses digest-pinned Node 22.23.4 Alpine with the unchanged npm lock and lifecycle scripts disabled. Its final image uses digest-pinned official Nginx Alpine. Inter and JetBrains Mono Latin variable font files are bundled locally with OFL notices. No external font/API request is required by the current app. The images retain project attribution and MIT and reproduced dependency notices under `/licenses`, outside the served web root. Upstream installed wheel/base-image notices remain present.

Image digests are fixed in the Dockerfiles; updating a digest is a reviewed security/reproducibility change with fresh scans and regressions. Record and retain immutable built image IDs/digests for any authorized release; the local `phase3-private` tags are convenient mutable development tags, not release identifiers.

## Local HTTPS candidate

Use Docker Desktop's Linux engine or a compatible Linux Docker/Compose installation. Obtain a **local test certificate only**, with localhost/127.0.0.1 SANs, in a directory outside this source tree. Production needs separately reviewed, valid certificates and renewal. Never copy private keys into source, Docker build contexts, images, screenshots or reports.

PowerShell, from the source root:

```powershell
$env:REFUNDSHIELD_ORIGINS='https://127.0.0.1:8443'
# Set this to an existing PRIVATE directory holding tls.crt and tls.key.
$env:REFUNDSHIELD_TLS_DIR='C:/path/to/private/local-test-certs'
docker compose -f deploy/compose.yaml build
docker compose -f deploy/compose.yaml up -d --no-build --wait --wait-timeout 60
docker compose -f deploy/compose.yaml ps
```

The path above is an illustrative local path, not a supplied certificate or secret. Docker mounts that directory read-only at `/run/secrets`. Open `https://127.0.0.1:8443` only for local testing. A self-signed certificate tests encryption/configuration, not public certificate trust or renewal. Browser QA's trust exception is restricted to the loopback test origin and must not be generalized to public hosts.

Backend test image (not deployed):

```powershell
docker build -f deploy/Dockerfile.test -t refundshield-test:private .
docker run --rm --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --cap-drop ALL --security-opt no-new-privileges --cpus 1 --memory 1g --pids-limit 64 refundshield-test:private
```

This uses the separate 27-package hash-locked Linux test closure. It does not add pytest/httpx to the production runtime.

## Budgets and security boundaries

- API: one worker, one CPU, 1 GiB memory, 64 PIDs, read-only root, bounded `/tmp`, all capabilities dropped and no privilege escalation. BLAS/OpenMP threads are bounded to one. Health check reads the synthetic `/api/health`. The existing API guard admits at most 600 reads/minute and 8 in-flight requests per process; cache size is 32 with single-flight construction.
- Web: half a CPU, 128 MiB memory, 32 PIDs, read-only root, bounded `/tmp`, dropped capabilities, no privilege escalation. Its internal HTTP health listener serves only `/healthz`; it is not published. No Vite dev/preview or QA server is exposed.
- Nginx: shared API rate budget 8 requests/second with burst 32, 8 proxied connections, 1 KiB request body, bounded headers, 3-second upstream connection and 20-second response deadlines, 5-second keep-alive. The burst covers the existing 10-read threshold sweep followed by the 12-read comparison plus page analysis. Sustained and in-flight limits are unchanged. Capacity responses include 429 and conservative Retry-After guidance. The proxy and backend independently reject mutations. These shared budgets can shed concurrent demo traffic; they are not per-user fairness or distributed DDoS controls.
- Same-origin HTTPS, exact configured origins, no credential cookies, SPA deep-link fallback, immutable hashed assets and revalidated HTML. API/docs/private/source paths do not fall back to the SPA. No source maps or private evidence are copied into the images.
- CSP allows same-origin scripts/fonts/API, data images and inline styles needed by chart/animation libraries; it allows no inline script or eval. Frame ancestors, objects and form submission are denied. Referrer, MIME, framing and permission headers are set on HTML, assets, API and error responses. Inline style permission remains a documented design tradeoff, not an XSS guarantee.
- Access logs are off. Nginx request-bearing diagnostics are limited to critical errors; the API uses no access log and generic unexpected-error responses. Container logs rotate. Use health/status/aggregate metrics for operations, not visitor notes/search text.

## Hosting review and rollback

Before any authorized public hosting, select a domain/provider/budget, decide ingress/TLS termination and certificate renewal, verify exact origins/host policy, review base-image/OS and third-party distribution rights, refresh vulnerability/secret scans and verify the target host. Add suitable edge/global controls and operational monitoring. Review HSTS only once a real HTTPS domain/renewal policy is ready; localhost testing does not establish it. No real customer data or actual refund processing belongs in this demo.

Retain the previous approved image digests and source/lock checksums. A rollback must select that **immutable known-good pair**, check its advisory status and restore the same validated origin/certificate configuration. Recreate the candidate containers, wait for health, check SPA deep links/read-only API and synthetic notices, and disable ingress if checks fail. There is no server-side case database or migration; browser-local state remains visitor-editable and may outlive a container replacement.

Stop only this Compose project after local validation:

```powershell
docker compose -f deploy/compose.yaml down --timeout 15
```

Do not prune unrelated images, volumes or containers. Do not change public port bindings, push images or start external hosting without separate authorization.
