# Render Free adapter — local candidate, not deployed

Team: **The Anomaly Syndicate**. Original application/scoring, deterministic scenarios, browser-local investigation state and existing two-container deployment are preserved. This additive adapter targets one Linux-amd64 Docker Web Service behind Render's HTTPS edge. No live URL is claimed. Deployment requires separate authorization after the gates below pass.

## Architecture and boundaries

`deploy/Dockerfile.render` builds the unchanged Vite frontend using the frozen npm lock with scripts disabled, then serves static output through non-root Nginx alongside one Uvicorn worker. The API listens **only on a Unix socket** inside a mode0700 directory. Nginx alone listens on `PORT`; no Vite/preview/QA service or separate API TCP port is exposed. A standard-library supervisor starts/reaps both processes, stops both when either dies, and forwards shutdown signals with a bounded12-second child-stop budget. Startup readiness is bounded to120 seconds for cold imports at0.1 CPU; no health success is returned before the private API responds.

`deploy/render_app.py` adds four-distinct-key work admission around the original FastAPI app. Same-key parallel endpoint reads remain available; a fifth distinct `(scenario, threshold)` in-flight key receives429/Retry-After60. Counts release on completion, error and cancellation; they contain no case/customer/note state. The existing API still validates IDs/parameters, denies mutations, caps600 reads/minute and8 total in-flight requests, and keeps its32-entry single-flight analysis cache. No model, score, explanation or dataset is changed.

The Nginx target preserves8 requests/second, burst32 and8 proxied connections,1KiB request bodies, bounded headers/deadlines, same-origin `/api`, static-only SPA fallback, private/source/docs denial and the original CSP/security headers. The separate key-admission budget prevents independent cold calculations from exceeding the unchanged20-second HTTP deadlines. A four-connection global cap was tested and rejected because legitimate pages make multiple same-key reads.

Readiness uses a private lightweight API-root check independent of visitor `/api` budgets. Nginx serves only its resulting `ok` marker at `/healthz`; stale readiness is removed on failure/shutdown. The container health probe uses the existing lightweight BusyBox client, not a fresh Python import under0.1 CPU. Non-root Nginx logs only critical request diagnostics; API access logs are off and supervisor errors do not print environment values or visitor data.

The supervisor refuses root, applies Linux no-new-privileges itself, disables core dumps and bounds open files/file size. Root-owned application/static files are not writable by the runtime UID even without a read-only-root flag. Local tests additionally use a read-only root, dropped capabilities, no privilege escalation,64 PIDs, no swap, an internal network and a512,000,000-byte/0.1CPU cgroup. Managed-provider filesystem/capability/PID settings are not assumed to reproduce every Compose flag; verify actual provider isolation before deployment.

## Reproducible build and notices

- Existing digest-pinned Node22.23.4 and Python3.14.10 Alpine bases; existing19-package CPython3.14/musllinux-amd64 binary-wheel hash lock and build-time pip check. No pip/compiler/test dependencies remain in production.
- Nginx1.30.6-r0 and PCRE2 10.49-r0 are the only added OS packages. `deploy/render-apk.sha256` fixes their exact official Alpine artifact hashes; installation verifies these hashes and distribution signatures. An unavailable/mismatching artifact fails the build instead of silently upgrading.
- `deploy/patch-runtime-zlib.sh` replaces the pinned base's zlib with Alpine's signed, SHA-256-pinned `1.4-r0` package across all three production images. This addresses CVE-2026-4738. The zlib 1.4 notice is bundled at `/licenses/alpine/zlib-LICENSE`.
- MIT/team attribution and existing Python/frontend/font notices remain. Additional unmodified Nginx, PCRE2 and its pinned SLJIT subcomponent notices live under `docs/licenses/render` and are copied to `/licenses/render`. PCRE2 includes BSD-3-Clause WITH PCRE2-exception and separate JIT terms; do not call all third-party runtime code MIT-only. Base-image GPL/LGPL/source-availability obligations remain applicable if binaries/images are distributed. No image has been pushed.
- The Docker context uses a positive allowlist; only built frontend assets are served. Certificates, credentials, private evidence, original archives, installed QA packages and source maps are excluded.

Build from the repository root:

```powershell
docker build -f deploy/Dockerfile.render -t refundshield-render:local-rc .
docker run --rm --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=32m --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus 1 --pids-limit 64 --mount "type=bind,src=$PWD/deploy,dst=/tests,readonly" --entrypoint python refundshield-render:local-rc /tests/test_run_render.py
```

The second command runs17 standard-library adapter regressions; it is not a production start command. These tools/tests are not included in the deployed image. Other CPU architectures and libc/Python ABIs require their own locked resolution and validation.

## Local HTTPS target validation

The **test-only** edge simulates provider TLS termination. It is a separate local test fixture, not a second Render service. Supply existing local-only `tls.crt`/`tls.key` outside the repository; never commit them. The adapter has no published host port; only the edge binds127.0.0.1:8443.

```powershell
$env:REFUNDSHIELD_TLS_DIR='C:/path/to/private/local-test-certs'
docker compose -f deploy/compose.render-test.yaml up -d --wait --wait-timeout 160
python qa/release-check.py --local-self-signed --load --output 'C:/path/to/private/api-results.json'
python qa/render-check.py --cache --lifecycle --output 'C:/path/to/private/render-results.json'
```

`render-check.py` refuses a different Compose project and checks UID/resource policy, private socket/closed backend TCP port, Host validation, full mixed-cache workload, bounded concurrent misses, real readiness, restart and child-failure recovery. It intentionally changes only this named local test runtime when `--lifecycle` is given. Source/notes/scoring do not change. Keep output outside the source tree.

Install the separate frozen `qa/` tools as documented in VALIDATION.md. For the target browser run, use `BASE_URL=https://127.0.0.1:8443`, `BROWSER=chromium`, `BROWSER_CHANNEL=chrome`, a private file-URL `RESULTS_DIR`, and `ANALYSIS_WAIT_MS=60000`. Only the multi-request sweep/comparison harness budget changes; ordinary single-request/page budgets and application20-second HTTP deadlines are unchanged. The default remains20000; accepted aggregate budgets are bounded to20000–90000. No assertions are disabled. Run `node browser-check.mjs` and `node security-browser.mjs` sequentially, outside other capacity probes.

```powershell
docker compose -f deploy/compose.render-test.yaml down --timeout 20
```

Stop only this test project; do not prune unrelated Docker resources. Self-signed trust is permitted only for these fixed loopback tests, never for a real host. Browser/Axe checks do not certify human screen-reader, physical touch/zoom/high-contrast or Safari/iOS use.

## Render configuration and Free limitations

`deploy/render.yaml` declares exactly one Docker web service, explicit `plan: free`, Singapore proposed, manual auto-deploy off, `/healthz`,20-second shutdown allowance and no database/disk/worker/paid resource. Do not apply it until the reviewed adapter commit is available and deployment is separately authorized; applying a Blueprint starts the initial build even with automatic deploys off. The proposed name does not establish an available URL.

`PORT` defaults to10000 and is strictly validated. On Render, the adapter derives one exact HTTPS origin from `RENDER_EXTERNAL_HOSTNAME`; an explicit single canonical `REFUNDSHIELD_ORIGINS` can be reviewed for a custom host. No wildcard/multiple origins, credentials, path/query/fragment or config injection are accepted. For local HTTPS use `https://127.0.0.1:8443`. Do not enter tokens in Vite variables or Render runtime settings; the synthetic app needs no external secret/API/database. Use the default provider HTTPS domain; no domain purchase is required.

Current provider references: [Free limits](https://render.com/docs/free), [Free CPU/RAM and Blueprint fields](https://render.com/docs/blueprint-spec), [default hostname/port variables](https://render.com/docs/environment-variables), [health checks](https://render.com/docs/health-checks).

Free is0.1CPU/512MB with shared750 instance hours/month, ephemeral storage, idle sleep after15 minutes and slow wake-up. Hobby build/bandwidth quotas are workspace-shared; the last account review showed500 pipeline minutes and5GB bandwidth. Retain no card and$0 additional pipeline spend, select Free explicitly and stop on any paid-plan/card/upgrade requirement. Cold starts, queue shedding and multi-second uncached analyses are expected demo limitations, not a production SLA. Do not use keep-alive pings to defeat idle sleep. Notes remain visitor-editable tab sessionStorage; no server database or durable audit history is promised.

## Gates before hosting

1. Review the exact adapter source/artifact diff and current scans/licenses. Publish the reviewed adapter through the approved narrow route; require green CI for that new commit. The earlier one-line CI fix does not certify an unpublished adapter branch.
2. Confirm actual host amd64/musllinux compatibility, UID/no-new-privileges, CPU/RAM/ephemeral storage and available isolation/monitoring. Local capped Linux tests are not host verification.
3. Recheck no-card Hobby/$0 spend and explicit Free, source revision, origin, health and rollback. Obtain separate deployment authorization for the concrete configuration; no service creation or deployment is included here.
4. After authorized deployment, verify trusted HTTPS/redirects/deep links, all workflows/exports/reset/themes/mobile, CSP/origins/Host, mutation denial/invalid requests and safe finite load, health/restarts and actual idle resume. Never claim public-host results before executing them.
5. Retain an immutable known-good deployment for rollback or suspend ingress when unsafe. No database migration is needed; browser-local notes may survive server replacement. Recheck Free retention rather than assuming unlimited rollback history.
