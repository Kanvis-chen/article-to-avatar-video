# VisualHyper development guidance

## Open-source-first implementation

- This is a mandatory gate for every feature, refactor, infrastructure change, and substantial bug fix. Do not begin implementation until the open-source review below is complete.
- Before implementing a feature, audit maintained open-source projects and libraries that already solve the same problem or expose a suitable extension point.
- Prefer adopting a dependency, wrapping an upstream API, or composing proven components over reimplementing equivalent behavior locally.
- Evaluate candidates for license compatibility, maintenance activity, security history, runtime and bundle cost, API fit, and long-term replaceability.
- Preserve all required attribution, copyright notices, and license files when third-party work is adopted.
- Do not copy code with an unclear license, or incorporate GPL/AGPL code into this project, without explicit approval and a license-compliance review.
- Record important adopted and rejected alternatives, with reasons, in an ADR or the feature's implementation notes.
- Write custom code only when no suitable maintained implementation meets the requirements. Document the specific capability, integration, or quality gap that requires custom work.
- Keep integrations adapter-based. HyperFrames remains the primary native engine, and adapters should preserve each engine's native project artifacts instead of performing lossy rewrites whenever possible.

### Required workflow for every development task

1. Define the capability and constraints before searching for implementations.
2. Search for maintained open-source projects, standards, libraries, and extension points that address the capability.
3. Shortlist the strongest candidates and compare license, maintenance, security, API fit, performance, bundle/runtime cost, platform support, and replaceability.
4. Choose one of these outcomes explicitly:
   - adopt an existing dependency;
   - wrap an upstream API behind a Kanvis adapter;
   - compose existing primitives;
   - implement custom code because documented gaps make the alternatives unsuitable.
5. Record the adopted and rejected options, links, versions, licenses, and decision reasons in an ADR or the feature implementation notes before merging.
6. Preserve attribution and license notices, pin intentional versions, and add tests around the integration boundary.

### Enforcement

- Plans and implementation summaries must include an `Open-source review` section, even when the conclusion is that no suitable project exists.
- Pull requests must identify any new dependency, its license, its purpose, and the adapter or replacement boundary.
- Do not copy source code from examples, repositories, blog posts, or generated snippets unless its license and attribution requirements are known and satisfied.
- Do not introduce GPL, AGPL, SSPL, Commons Clause, or other source-available/restrictive dependencies without explicit approval and a documented license review.
- Prefer small, replaceable integrations over framework-wide coupling. Business logic and project data contracts must not depend directly on one vendor's proprietary schema when an adapter boundary is practical.
- If the open-source review is missing, stop implementation and complete it first.
