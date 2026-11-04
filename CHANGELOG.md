# Changelog

Newest first. Every milestone adds an entry. A **Decisions** list records each default picked without asking, so it can be revisited.

## M4 · Direct API connectors · 2026-11-04

### Added
- **Connectors,** each a pure parser plus a fetch through Tauri's HTTP plugin, so there's no CORS in the app:
  - **Linear** (GraphQL, personal API key): an issue becomes a ticket item. The description comes first, then each comment as its own unit labelled with its author, with state, priority and labels.
  - **Figma** (REST, personal access token): a frame link becomes a screen item. Its text layers become units, and a PNG thumbnail is stored as data.
  - **Are.na** (REST, token optional): a channel's blocks become pins, notes and links, with images.
  - **Pinterest** (public board RSS, no token): pins with their images.
  - **Slack** (user token): a thread permalink becomes one item, with each reply labelled with who said it.
  - Pasting or dropping a link routes it to its connector automatically. Other links are still fetched as web pages.
- **Sync** on connector and link sources (Node tab). Changed content gets a new hash, so everything downstream goes stale. Unchanged content leaves the graph alone.
- **Vision:**
  - Images on heavy, normal or pinned sources go to Claude as image blocks: heaviest first, at most 12, budgeted at about 1.1k tokens each within 25% of the context.
  - The cache breakpoint moves to the last image.
  - The assembly report counts images sent and skipped.
- **Visual source nodes** (Figma 02 · Source · Visual):
  - A pin and screen grid with a count badge.
  - The Linear ticket card with labels.
  - A "synced 2m" footer.
  - Context cards in Understand show a three-up thumbnail strip for boards.
- **Settings:** a Sources section with a Keychain token per connector, and where to get each one.
- **Tests:**
  - Link matching for every platform.
  - Parsers for each API shape: Linear ordering and authors, Figma text deduplication, Are.na block kinds, Pinterest RSS with CDATA, Slack permalinks and threads.
  - Image assembly.
  - 71 in total.

### Decisions
- **Verification:**
  - The Are.na connector was checked end to end against the live API (72 blocks with images).
  - Linear, Figma and Slack need tokens, so they're tested against their documented response shapes.
  - Pinterest's RSS only works inside the app, because browsers block it with CORS.
- **Statsig** moves to M7, where Validate reads experiment results.
- **Pinterest RSS** is read by tag rather than through an XML parser, because feeds vary (CDATA, missing titles).

## M3 · Canvas and the first real flow · 2026-11-04

### Added
- **Live canvas (React Flow).**
  - Node views built from Figma 02: Claude, Source, Hypothesis, Output/Inlet.
  - **Claude node run states:** not run, running (elapsed time and moving bar), fresh ("Ran 2m ago · 14s"), stale ("Inputs changed · rerun", amber), over budget ("Context 212k / 200k", red) and failed.
  - **Typed ports:**
    - 10px rings in the port-type color.
    - While a wire is dragged, compatible ports glow and the rest dim.
    - A 24px snap radius and an 8px grid.
    - A mismatch shakes the target and shows the reason.
  - **Wires** are colored by what they carry: inlets in their phase color, hypotheses yellow, Claude text white. They dash while their target runs and are dotted when switched off.
  - **Focus mode:** the active phase full size, with inlet and outlet rails. Focus off puts all five phases on one canvas as regions.
- **Collect and Weigh (Understand):**
  - Ways to add context: drop files, ⌘V text or links, the Add node menu, or the sidebar +.
  - Transcripts (including .vtt/.srt) are detected, split per utterance, and named after their speakers.
  - Links are fetched once, readable text is extracted, and the OG image becomes a thumbnail.
  - Images are downscaled into the source.
  - Every source wires itself into the phase's Claude node.
  - Context cards are sized by weight, as in Figma 07: heavy is 230px with an orange border, normal 150px, light 110px at 70% opacity, mute 35% with a strike-through. Pinned cards get a dashed ring.
  - Weight popover (Mute/Light/Normal/Heavy, Pin into every phase, a "Why heavy?" note). W cycles weight and P pins.
- **The Understand → Define loop:**
  - New projects start with Synthesize insights → Weighted context.
  - Locking (⌘L) writes an immutable version and a snapshot, then scaffolds Define with an inlet, Draft statement and Testable statement, and moves the focus there.
  - Locking a newer version repoints the inlet, so Define goes stale.
  - The statement card (Figma 07 · Define):
    - Frame tabs: Hypothesis, Problem statement, How might we, User statement.
    - The sentence, with who/behavior/because/metric colored.
    - Part chips and four checks.
    - Alternates with Compare.
  - **Lock hypothesis** also enters the statement into the memory chain as H1 (testing).
- **Inspector:**
  - **Preview:**
    - Streams while running: thinking summary, then the statement or summary as it arrives.
    - Renders insights and statement cards.
    - Shows source items with their units.
  - **Context section:** chips with token counts and include toggles, a budget bar, shares by weight, and Always on.
  - **Instruction editor:** `{references}` are highlighted live, and unknown references are flagged.
  - **Prompt tab:** every block in order, where the cache breaks, and what was trimmed per document.
  - **Node tab:** title, alias, model, effort, budget, frame, weight, pin and why. Draft hypotheses are editable.
- **Shell:**
  - The phase rail shows ✓ for locked phases and the Define frame as its output.
  - The title bar shows the project name (double-click to rename) and save or run status.
  - The sidebar lists the project's sources, the hypothesis chain, learned rules and locked outputs.
  - The history bar draws the real snapshot timeline with bookmarks and the playhead.
- **Settings (⌘,):** the Anthropic API key, stored in Keychain, with a connection check.
- **Shortcuts:** ⌘↵ run, ⌘. cancel, ⌘B snapshot, ⌘L lock, ⌘1–5 phases, W, P, V, H, N, Esc.
- **Persistence:**
  - Every edit autosaves the working graph.
  - Every run and lock writes a snapshot.
  - Runs record prompt, report and artifact blobs.
- **Tests:** ingest, the timeline layout, and the partial-JSON reader. 64 in total.

### Decisions
- **No real Claude call yet.** There was no API key in this session, so the end-to-end flow was checked with a dev-only scripted model (`pnpm web` and `localhost:1420/?fake`) that streams through the real engine. The first real Claude call happens once a key is added under Settings (⌘,).
- **Visual check:** the screen was locked during M3's visual pass, so the native window couldn't be captured. Node sizes, type, ports and colors were checked against Figma through computed styles in the web build (same React code), and M1's native screenshots matched.
- **Auto-advance:** locking moves the focus to the next phase only once that phase has a recipe. Build arrives in M6.
- **React Flow attribution** is shown, small and muted, as React Flow's authors ask for non-Pro use.
- **Not in M3:**
  - PDFs. Paste the text instead.
  - Images as visual input to Claude. They go in by title for now; vision comes with M4's visual sources.
  - The Comment tool and ⌘K search (M10).
  - Moving node components into `packages/nodes` (M8, when the renderer needs them).

## M2 · Data model and engine core · 2026-11-04

### Added
- **`@composer/core`:**
  - Synchronous SHA-256, checked against `node:crypto` with property tests.
  - Canonical JSON and content addressing.
  - ULIDs.
  - Domain types: four node kinds, four port types, weighing, context items made of atomic units, hypothesis blocks, output versions.
  - `Graph` ↔ `Manifest` (git-style, node blobs shared across snapshots).
  - Typed graph diff ordered by creation sequence, for playback.
- **`@composer/engine`:**
  - **Ports:** the port table and snapping to the matching port, with mismatch reasons worded as in Figma 05.
  - **Graph rules:** wires stay inside a phase, single-input ports, cycle rejection, topological order.
  - **Keys and status:**
    - Cache keys per node (`localKey`) plus an environment key for foundations and rules.
    - Statuses: never_run, fresh, stale, stale_env (a softer badge).
    - Blast radius computed before anything runs.
    - Output lock state, including "newer available".
  - **Scheduler:**
    - Pull (⌘↵: node plus stale ancestors) and push (fork and rerun) plans.
    - Concurrency cap of 3, cancellation, latest-wins, failures skip dependents.
  - **Prompt assembly:**
    - Stable-first layout with four cache breakpoints, the 1h TTL first.
    - Weighted water-filling allocation, with pins capped at 15%.
    - BM25 salience; units are never split, and omission markers show what was cut.
    - An `AssemblyReport` per run (shares by weight, what was trimmed).
    - Over budget means heavy and pinned material alone doesn't fit.
    - `{alias}` templates render as `<alias>` tags. Unknown references block the run.
  - **Recipes:** `synthesize_insights` (Understand → weighted context) and `draft_statement` (Define → testable statement in 4 frames), both with structured-output schemas and renderers.
  - **`runClaudeNode`:** assembles, streams and parses. Refusals, max_tokens and bad output each raise their own error.
  - **`LlmClient` interface**, plus a scriptable `FakeLlm`.
- **`@composer/data`:**
  - A `SqlDriver` seam with a `node:sqlite` adapter for tests.
  - Migration 1: blobs, projects, branches, snapshots, bookmarks, runs, output versions, the hypothesis chain, prompt templates, craft rules, foundation versions, proposals, scores, decisions, links, token counts, settings.
  - A `Repo` covering all of them.
  - Only status columns are ever updated, and each change logs a decision. Nothing is deleted.
- **Desktop:**
  - rusqlite `db_all`, `db_run` and `db_tx` commands on one WAL connection.
  - Tauri `SqlDriver`, plus a sql.js fallback for the browser preview.
  - Keychain-backed secrets.
  - `AnthropicLlm`:
    - Streaming, adaptive thinking with summaries.
    - `output_config.effort` and `format` set per request.
    - `fallbacks: "default"`.
    - `countTokens`.
  - A boot step that migrates, marks orphaned runs interrupted, and opens or creates a project.
- **Tests:** 57 across core, engine and data, including property tests for SHA-256, blast radius and allocation.

### Decisions
- **Hashing:** SHA-256 is synchronous, so cache keys and status can be derived during render without promises.
- **"Over budget":** means the heavy and pinned documents alone can't fit. Anything lighter is trimmed by weight instead, so the brief is never cut silently.
- **Hypothesis inputs:** a hypothesis's `evidence` port accepts locked outputs and Claude text but not raw context, per the Figma error state.
- **Utility model:** utility calls stay on Opus 5.5. A per-node model override is in the node type, and its UI comes in M3.

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
