# Architecture and demo boundary

## Data flow

Deterministic synthetic scenario → feature engineering → individual risk / population threshold analysis / relationship graph → coordination / explanations → bounded read-only FastAPI → typed React API adapter → presentation.

Investigator simulation is a separate path: verified synthetic record → scenario-scoped browser workspace → status/notes/history overlay → detail, queue and reviewed counts. These overlays never alter risk, threshold, network or coordination scores and never execute a refund, evidence request, payment or customer operation. The backend always returns baseline unreviewed cases and zero reviewed counts. The client computes reviewed totals by matching locally reviewed IDs against the actual scenario queue, not by counting arbitrary stored keys.

## Local retention and recovery

- `sessionStorage` key `refundshield.workspace.v1`, schema version 1. Each case key is scenario + return ID. Notes ≤2000 characters, ≤100 retained cases across scenarios, ≤60 action entries per case, serialized state ≤600000 characters. Capacity errors leave the previous state intact.
- Current scenario, theme and scenario-scoped local activity use separate session keys. Activity is capped at60 entries per scenario and validated on reload. Legacy persistent logs are not imported.
- Reload restores valid state in the same tab. Independent browser contexts do not share state. Browser tab duplication may copy initial sessionStorage as a browser feature; later changes remain independent. A tab close normally ends the session, but browser session restoration can restore it: this is **not secure deletion** or a guaranteed retention deadline.
- Reset is confirmed and removes the selected scenario's case overlays and local activity only; other scenarios and analytical data remain. No real data should ever be entered. Local history/export is editable simulation evidence, not a durable or legally authoritative audit log.
- Invalid schemas, corrupt or oversized storage recover to an empty in-memory workspace with a notice. Unavailable/quota-blocked storage permits memory-only actions and warns that reload may lose changes. Reset writes a fresh valid workspace if storage is available.

## API controls

- All `/api` mutation methods (POST/PUT/PATCH/DELETE and any non-read method) return405. The old action/notes handlers and shared singleton store are removed. Hiding buttons is not the security boundary.
- Known finite scenarios; unknown IDs return404; threshold finite and0.01–0.9; queue limit1–500; activity limit1–40; search2–80 nonblank characters; known graph relationships only. Repeated/unknown query keys rejected. Query≤2048 bytes, API path≤240 characters, each query value≤80 characters.
- Analysis cache≤32 entries; single-flight construction under a lock. Process-wide budget600 admitted API requests/minute and8 in-flight requests. Reject capacity with429/Retry-After. Limits count process-wide, not individual visitor identities; this avoids retaining IP histories but one visitor can consume a process's shared read capacity. Future public hosting needs edge/global rate budgets, request deadlines, worker/memory limits and monitoring.
- CORS allows localhost/127.0.0.1 on5173/4173 by default, GET/HEAD preflight only, no credential cookies. `REFUNDSHIELD_ORIGINS` can explicitly list trusted origins; `*` is excluded. CORS does not replace authorization and does not restrict non-browser clients. Production should use an HTTPS same-origin proxy.
- Unexpected errors return a generic message; the client reports safe API/network failures and has a20s response-header timeout. Use `--no-access-log` in local instructions so notes/query text is not emitted to request logs. No local note/action is sent to the server.

## Verification and limits

The original regression suite checks the existing scoring behavior. No backend application/scoring/config/generator/domain/explanation source changed while preparing this release candidate. `requirements-tested.txt` retains the earlier Windows version constraints; the minimal runtime/development entrypoints and hash-verified musllinux runtime/test locks describe this candidate's target. Frontend dependency versions remain at the reviewed security patches. Release-specific presentation packaging hosts the existing font families locally with OFL notices. See DEPENDENCY_SECURITY.md and VALIDATION.md for exact boundaries, scans and executed checks.

The app is synthetic and rule-based, not a trained model or production fraud decision system. No real-world accuracy/precision/recall or fraud probability is claimed. Graph overlap can be legitimate; thresholds and synthetic scenarios demonstrate a mechanism, not validation on real customers.

## Future public deployment prerequisites

Separate authorization and team/license/asset review; resolved dependency/advisory review; production proxy/SPA deep links; HTTPS and restrictive origins; no source maps/private provenance/logs served; bounded workers/cache/rates/timeouts, operational health/metrics and disable/rollback plan. Current process-local limits are not distributed controls. Do not run Vite's dev server as a production host. Real customer workflows would require separately designed tenancy/RBAC, privacy/retention, durable authorized audit/storage and independent risk validation. No such scope was added here.

## Optional future work

Cross-browser/manual assistive-technology checks; additional benign/adversarial synthetic scenarios; dependency modernization in separately tested changes; public-source packaging after permission; authenticated durable cases only if the product scope explicitly changes. No new ML model is needed to finish the current synthetic demonstration.
