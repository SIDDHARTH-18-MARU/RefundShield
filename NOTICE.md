# Attribution and third-party notices

RefundShield — **The Anomaly Syndicate**. Original problem: **CX0507 — The Fraudulent Refund Loop**, FinTech & Digital Economy.

The team leader confirmed collaborator/challenge/asset rights, authorized public source and hosting subject to technical and cost gates, approved The Anomaly Syndicate team-only credit, and selected MIT for original project code subject to contributor rights. No sole ownership is claimed. See LICENSE and CONTRIBUTORS.md.

The application includes transparent rule-based synthetic analysis and a browser-local investigation simulation. No trained model, private dataset, real customer records, payment execution or third-party submission deck/media is included in this candidate.

Dependency attribution and reproduced license texts are catalogued in [third-party review](docs/THIRD_PARTY_LICENSES.md). Those texts govern the corresponding dependencies only; they do not grant a license to RefundShield's original source. Keep upstream copyright, license and NOTICE material with any distribution that requires it. Container/binary distribution must additionally preserve applicable upstream notices and satisfy its own redistribution obligations; this source license does not replace those terms.

The frontend uses React, React DOM, React Router, Recharts, Framer Motion, Lucide and their dependency closures. The API uses FastAPI, Uvicorn, NumPy, pandas, NetworkX and transitive dependencies. Exact versions are in npm lockfiles and the target-specific Python wheel locks. QA tools are separate from deployed artifacts.

Inter and JetBrains Mono Latin variable fonts are bundled from checksum-verified Fontsource Variable 5.3.0 artifacts under **OFL-1.1**. Unmodified font license texts are retained under docs/licenses/fonts. Upstream references: [Inter](https://github.com/rsms/inter/blob/master/LICENSE.txt), [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt). No Google Fonts request remains. System fallbacks cover glyphs outside the bundled Latin subset.

Container images also contain distribution/CPython/Nginx components and their notices. The base image and installed-package license scan is evidence for review, not a replacement for applicable source-offer/notice obligations. Retain base and installed package notices. No container image is distributed by this source repository. Review exact final hosted/distributed binary artifacts and their notices whenever images or dependencies change.
