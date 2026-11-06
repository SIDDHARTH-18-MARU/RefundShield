# RefundShield frontend

Private continuation of The Anomaly Syndicate CX0507 synthetic demonstration. React 18, TypeScript, Vite 6, Recharts and Tailwind 3. No public license selected.

See [root README](../README.md) for setup/workflows and [architecture](../docs/DEVELOPMENT.md) for exact API/storage boundaries. All server requests are read-only. Simulated actions/notes stay in a bounded versioned scenario-scoped tab workspace; they never execute refunds or alter analytical scores. No real customer information.

Run the local backend on127.0.0.1:8000, then npm ci --ignore-scripts and npm run dev -- --host 127.0.0.1 --port 5173 --strictPort here. Vite proxies /api to8000. Production needs separately configured proxy/SPA routing.

npm test runs Vitest 4.1.12; npm run typecheck checks TypeScript; npm run build typechecks and bundles with Vite 6.4.5. React Router7.18.5 retains declarative routing and React 18. Browser tools live separately in ../qa. Phase 2 updates the package-lock for security fixes; install it with npm ci --ignore-scripts. See ../docs/DEPENDENCY_SECURITY.md and ../docs/RELEASE_READINESS.md for current scans, compatibility, license obligations and separate publication gates.
