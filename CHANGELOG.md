# Changelog

Newest first. Every milestone adds an entry. A **Decisions** list records each default picked without asking, so it can be revisited.

## M1 · Scaffold and tokens · 2026-11-04

### Added
- **pnpm workspace:**
  - `apps/desktop` (Tauri 2 + React 19 + Vite 8)
  - `packages/core` (phase model)
  - Root TypeScript 6, ESLint 10, Prettier, Vitest 5
  - `pnpm check` runs lint, typecheck and tests.
- **Design tokens** (`apps/desktop/src/styles/tokens.css`):
  - Taken from the Figma variables: surfaces, borders, text, phases, signals, paper, type scale, radii and layout sizes.
  - A `data-phase` attribute sets the accent for any subtree.
- **Fonts:** Geist and Geist Mono bundled as variable woff2 files, with the OFL license next to them.
- **Static 01 Workspace shell, built from the Figma frames:**
  - Title bar with overlay traffic lights.
  - Phase rail with Focus toggle.
  - Sidebar: sources, memory, foundations and memory health.
  - Canvas chrome: 28px grid, rulers, corner brackets, phase header, watermark, cursor crosshair readout, inlet and outlet rails, toolbar, minimap.
  - Inspector: live preview, context budget, always-on foundations, context chips, instruction with highlighted references, Run node and Snapshot.
  - History bar: transport, phase-colored timeline, run ticks, bookmarks, branch curve, playhead.
- **Interactive bits:** phase switching, Focus, inspector tabs, chip toggles, canvas tools.
- **Keychain:** `secret_get`, `secret_set` and `secret_delete` Rust commands using the macOS Keychain (`keyring`).

### Decisions
- **TypeScript 6.0:** pinned because typescript-eslint does not support TS 7 yet.
- **Fonts:** the `geist` npm package pulls in Next.js as a peer, so the two variable font files are vendored instead.
- **Inlet label:** reads "01 · UNDERSTAND · INLET · WEIGHTED CONTEXT", as in the Figma text layer. The layer's name still says Empathize.
- **Focus off** shows "ALL PHASES" in the canvas label. The multi-region layout lands with the canvas in M3.
- **Placeholders:** the shell renders the Figma project ("Recap after a session") from `src/fixtures/workspace.ts`. M3 replaces each slice with live data.

## M0 · Repo and docs · 2026-11-04

### Added
- `ARCHITECTURE.md` covers:
  - the data model
  - the node type system
  - the execution engine
  - storage
  - prompt assembly
  - connectors
  - Build, Share and Foundations
- `PLAN.md` holds milestones M0–M10 and the verification plan.

### Decisions
- **Agreed with Andrew:**
  - Sources use direct APIs with tokens in Keychain.
  - Build ships code and Figma output in v1.
  - Share uses Remotion and other creative tooling.
- **Model:** Claude Opus 5.5 (`claude-opus-5-5`) everywhere by default.
  - Adaptive thinking, with effort set per recipe.
  - Server-side refusal fallback is on.
  - Model can be overridden per node.
  - Utility calls default to Opus 5.5 at low effort and can be switched to Haiku 5.5.
- **Context budget:** 200k per node by default, as drawn in Figma. Configurable.
- **Figma copy fixes:**
  - Canvas rails say Understand and Build, not Empathize and Ideate.
  - Define's output is "Testable statement".
  - Share's output is "Release story".
- **Styling:** CSS variables and CSS Modules (no Tailwind). Geist and Geist Mono are bundled. `motion` for animation.
- **Database:** custom rusqlite commands on one connection instead of tauri-plugin-sql. Transactions must not split across pooled connections.
- **Snapshots:** content-addressed blobs, and every snapshot is a manifest hash, as in git. Locked outputs are firewalls: the next phase consumes a specific version through an inlet.
- **Prompt context:** trimmed by weighted water-filling over atomic units, never summarized. Each run stores an AssemblyReport showing what was cut.
- **Remotion license:** free for individuals and companies of up to 3 employees. Slingshot work needs a Company License. The renderer is isolated behind an interface.
