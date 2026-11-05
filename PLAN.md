# Design Composer: milestone plan

**Status:** M0–M10 shipped on 2026-11-04. M11 (workspaces, key nodes, Build variants, evals) built on 2026-11-05 on a branch, waiting on review. What each milestone delivered, and every default picked along the way, is in [CHANGELOG.md](CHANGELOG.md).

This is the plan of attack. The design behind it is in [ARCHITECTURE.md](ARCHITECTURE.md).

**Decisions made with Andrew (Nov 4, 2026):**
- **Sources:** direct APIs with personal tokens in macOS Keychain.
- **Build:** code prototypes and Figma output both ship in v1.
- **Share:** creative tooling. The walkthrough renders with Remotion.
- **Repo:** this one, `andrewhulin/Composer`. Each milestone is one commit on `main`, pushed.

## Milestones (one commit each; CHANGELOG.md updated every time)

Each milestone ends with: tests green, app run and checked against Figma, CHANGELOG entry, one commit on `main`, push to `andrewhulin/Composer`.

| # | Milestone | Done when |
|---|---|---|
| M0 | Repo + docs | clone `andrewhulin/Composer` to `~/Documents/GitHub/Composer`; `ARCHITECTURE.md`, `PLAN.md`, `CHANGELOG.md`, `README.md`, `.gitignore` committed on `main` and pushed |
| M1 | Scaffold + tokens | rustup; Tauri 2 + React + TS + Vite (pnpm); plugins; Keychain command; tokens.css from Figma; Geist fonts; static window shell matching 01 Workspace; Vitest/ESLint/Prettier; `pnpm check`; app launches and the screenshot matches Figma |
| M2 | Data + engine core | core (canonical JSON, hashing, manifest + diff); data (SqlDriver, rusqlite commands, node:sqlite adapter, migrations, repositories); engine (port matrix, DAG ops, inputKey/status/stale_env, blast radius, pull/push scheduler, streaming sink); prompt assembly (layout, water-filling, units, AssemblyReport, templates); LLM wrapper (stream, cache, countTokens cache, fallbacks); full unit tests |
| M3 | Canvas + first real flow | phase regions, focus mode, four node components + states, typed snap/shake, sidebar drag-out, file/link/image/paste/transcript sources, Weigh (Mute/Light/Normal/Heavy, W cycles, pin, why, size by weight, share-of-prompt bar), Understand synthesize → lock Weighted context, Define draft statement (4 frames, highlighted parts, checks, alternates, Compare, Lock), inspector (Preview/Prompt/Node, chips, budget, instruction editor), Run ⌘↵ streaming, Settings (API key). Verified end to end with a real Claude call, plus screenshots against 01, 02 and 07 |
| M4 | Connectors | Linear, Figma, Are.na, Pinterest RSS, Slack, Statsig; source sync + caching; visual source variants |
| M5 | History + memory chain | auto snapshots, timeline, bookmarks, branches, playback (read-only, node-by-node, speeds, runs only, thumbnails), compare, swap flow (candidates, amber blast radius, fork and rerun, ⌘Z merge), undo |
| M6 | Build | code prototype runtime + live preview, fidelity, on-system lint; Figma plugin (pairing, Send to Figma, selection → Composer) |
| M7 | Validate | test strategy (success/guardrail/kill), methods (Slack post + replies, 360 notes, Statsig read, survey toggle), verdict, holds → Share / misses → loop N+1 |
| M8 | Share | Remotion renderer (4 chapters, real graph, prototype in device frame, metrics), player, MP4/GIF/poster, voiceover, PR via gh |
| M9 | Foundations + improvement | DS + philosophy slots with seed import, changelogs, proposal review flow, scoring, Reflect job, approval queue, memory health, Craft memory across projects |
| M10 | Polish + package | keyboard map, empty/error states, performance pass, app icon, `pnpm tauri build` .app |
| M11 | Workspaces + evals | Define as a writing workspace (fixed form, evidence rail, variants, Lock) and Validate as a scorecard (pinned statement, metrics with targets, lanes per source, verdict); a key node pinned in every phase with an editable prompt preview of the handoff; Build variants by default with fork rounds, the interaction kit and direct tweaks without a rerun; pairwise picks, pinned notes and replay of past briefs before a rule or principle is kept |

- **Questions back to Andrew** happen only when a choice changes the product. Every other default goes into CHANGELOG.md under "Decisions".

## Verification

- **Unit tests (Vitest + fast-check, Node):**
  - Port matrix and every reason string; cycle rejection.
  - The loop to N+1 creates no edges.
  - **Property:** for random DAGs and mutations, blast radius equals the set that is actually stale after the mutation, and locks stop propagation.
  - **Allocation:** total ≤ budget; Mute gets 0; raising a weight never shrinks that item's share; units never split; deterministic; pins always present.
  - **Prefix stability:** golden prompts with BP3 and BP4 invariance.
  - **Scheduler:** topological order, the concurrency cap is never exceeded, cancel and latest-wins behave, failures skip dependents.
  - **Data:** migrations, snapshot round-trip and diff, playback ordering, undo deletes no rows, lock contracts, fork and merge back.
- **LLM layer:** a `FakeLlm` that scripts deltas, delays, errors and aborts, plus record/replay fixtures. One opt-in live smoke test uses the real API key.
- **Visual checks:**
  - At each milestone, the frontend runs in the browser pane with a mocked Tauri bridge for fast checks.
  - Then `pnpm tauri dev`, with a screenshot of the real window compared side by side against the matching Figma frame (screenshot via the Figma MCP).
  - Fixes go in before the milestone is called done.
- **End-to-end per milestone:**
  - **M3:** drop a transcript and a link, weigh them, synthesize, lock, then draft and lock a statement with a real Opus 5.5 call.
  - **M5:** swap H1 to H2 and replay.
  - **M6:** prototype renders and lands in Figma.
  - **M8:** an MP4 renders and a PR opens on a scratch repo.
