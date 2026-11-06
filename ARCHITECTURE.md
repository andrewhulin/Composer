# Design Composer: architecture

Design Composer is a Mac app that runs a product design process as a node graph, with Claude as the engine inside each node.

**Sources of truth**
- **Spec:** Notion "Design Composer".
- **UI:** Figma "Design Harness" (`sEYeY0fivWVBcu9TTiDnvV`), pages 01–07.

The milestones live in [PLAN.md](PLAN.md). Decisions and defaults are logged in [CHANGELOG.md](CHANGELOG.md).

## 0. Core model

**Five phases** sit on the canvas as regions. Each phase holds nodes and ends in exactly one key node: a typed output whose text is exactly what the next phase's prompt reads.

| Phase | Surface | Output | Purpose |
|---|---|---|---|
| 01 Understand | Node canvas | Weighted context | Collect everything, unfiltered. Weigh each item Mute, Light, Normal or Heavy, pin it, and note why. |
| 02 Define | Writing workspace | Testable statement | One statement written well, in a fixed form: we believe, for whom, we'll know when. |
| 03 Build | Node canvas + variants board | Prototype | Variants side by side at any fidelity, in code (live preview) and Figma. |
| 04 Validate | Scorecard | Verdict | Success, guardrail and kill metrics with targets, one lane per evidence source. A miss loops back to Understand. |
| 05 Share | Node canvas | Release story | Animated walkthrough and/or PR. The only exit from the loop. |

Understand, Build and Share gather and combine many things, so they stay node canvases. Define and Validate are purpose-built workspaces over the same graph (`PHASE_SURFACE` in `packages/core/src/phases.ts`); the graph under them is one toggle away (G). Section 11 covers the workspaces and key nodes, section 12 the evals.

**Principles** (from the Figma cover):
- One phase in focus.
- One output per phase.
- Hypotheses are blocks.
- Everything is a snapshot.

## 1. Shape of the app

pnpm workspace:

```
apps/desktop/            Tauri 2 shell (Rust) + React 19 webview (Vite)
  src-tauri/             rusqlite DB commands (db_all/db_run/db_tx, one connection),
                         Keychain (keyring), HTTP for connectors (tauri-plugin-http),
                         fs/dialog/shell (gh, git, node renderer), Figma-plugin WebSocket bridge
  src/ui/                React Flow canvas, panels, inspector, history
  src/store/             Zustand slices (manifest, runs/streams, history, ui)
  src/llm/               Anthropic SDK wrapper (stream, cache, countTokens, fallbacks)
  src/connectors/        Linear, Figma, Are.na, Pinterest RSS, Slack, Statsig, gh, files/links/images
packages/core/           types, ULIDs, canonical JSON, sha256, Manifest + diff
packages/engine/         ports, graph ops, keys/staleness/blast radius, scheduler, prompt assembly
packages/data/           SqlDriver interface, migrations (.sql), repositories
packages/nodes/          node React components shared by the canvas and the renderer
packages/renderer/       Remotion project for Share videos
packages/figma-plugin/   companion plugin (DOM→Figma frames, selection → Composer)
```

- **Claude calls** go through the Anthropic TS SDK in the webview.
  - The API key is read from macOS Keychain by a Rust command.
  - Calls stream everywhere: `client.beta.messages.stream`, rendering deltas and finishing with `finalMessage()`.
  - The browser-access option is verified against the SDK repo in M2, not guessed.
  - The CSP limits `connect-src` to api.anthropic.com plus the enabled connector hosts.
  - `LlmClient` is an interface, so calls can move behind Rust later.
- **Database access uses custom rusqlite commands** on one connection, not tauri-plugin-sql. The plugin's connection pool can split BEGIN and COMMIT across connections.
- **Only `apps/desktop` imports React or Tauri.** core, engine and data run under Vitest in Node, with `node:sqlite` and the same migration files.

## 2. Data model

Three rules everything else depends on:
1. **Content is immutable and content-addressed.** Blobs are keyed by sha256 of canonical JSON. Rows with identity (runs, scores, decisions, versions) are append-only and point at blobs.
2. **A snapshot is a manifest hash**, as in git: `{v, nodes: {id → hash}, items: {id → hash}, edges[]}`. The working state is an immutable Manifest in Zustand. An edit rehashes only the entries it touches.
3. **Locks are firewalls.** A downstream phase consumes a specific `output_version` through an **inlet**, never a live node. An inlet is the Output kind in inlet mode, drawn like the "Weighted context · INLET" node in Figma. This also keeps the phase loop acyclic.

The only mutable columns are branch head and state, proposal status and hypothesis status. Each change to one of them also writes a `decision` row. Reverting creates a new version that points at the old content. Ids are ULIDs. Ordering uses a per-project monotonic `seq`, never wall-clock time.

Entities (illustrative; final names live in `packages/data/migrations`):
- **Project:** id, name ("Recap after a session"), active_phase, loop_index, branch_id, head_snapshot_id.
- **Node:** id, project_id, phase, kind, subtype, title, position, size, config_hash, weight, pinned, weight_note, alias.
  - kind is one of `source | claude | hypothesis | output`.
  - subtype is a source kind or a Claude recipe.
  - weight is one of `mute | light | normal | heavy`.
  - alias is the name used in instruction templates, such as `{interviews}`.
- **Edge:** id, source_node, source_port, target_node, target_port.
- **Blob:** hash, kind, json, created_at. Holds context items, Claude text, statements, prototypes, test plans, verdicts, release stories and node configs.
- **ContextItem** (inside source artifacts):
  - Main fields: id, source, title, raw text or media ref, thumbnail asset hash, url, author, timestamp, and type (`quote | pin | ticket | screen | request | data | transcript | link | file | image`).
  - Excerpt anchors, so trimming can cut text without paraphrasing it.
- **Asset:** sha256, path, mime. Files live under `~/Library/Application Support/Design Composer/assets/`.
- **Run:** id, node_id, snapshot_id, status, model, effort, prompt_version_id, cache_key, input_hashes, output_hash, assembled_prompt_hash, usage (in, out, cache_read, cache_write), cost, stop_reason, error, started_at, finished_at.
- **PhaseOutput:** project_id, phase, loop_index, version, artifact_hash, locked_at, snapshot_id. A phase has one locked output per loop, and a new lock means a new version.
- **HypothesisBlock:** id, project_id, label ("H2"), statement, variables, status, confidence, parent_id, evidence_refs, created_snapshot_id, result.
  - Each variable is `[{key, value}]`.
  - status is one of `draft | testing | held | failed | retired`.
  - parent_id records the fork.
- **Snapshot:** id, project_id, branch_id, parent_id, seq, reason, run_id, manifest_hash, label_suggestion, created_at.
  - reason is one of `run | lock | swap | branch | manual`.
  - The manifest holds nodes as {id → config_hash}, edges, outputs as {nodeId → artifact_hash}, active hypotheses, weights and the phase.
- **Branch:** id, project_id, name, fork_snapshot_id, retired.
- **Bookmark:** id, snapshot_id, label.
- **Score:** run_id, value (1–5), note, created_at.
- **Decision:** id, project_id, kind, payload, evidence_refs, snapshot_id. kind covers lock, swap, weight change, reject, accept, edit_output and keep_variant. Decisions feed the philosophy.
- **Foundations** (Craft tier, shared across projects; each project pins versions):
  - **DesignSystemVersion:** version, source, tokens, components, type_styles, doc.
  - **DSProposal:** id, kind (`change | add`), diff, evidence, affected, status, reject_reason. reject_reason answers "wrong value or wrong idea?"
  - **PhilosophyRev:** rev, principles. Each principle has n, text, strength (`forming | steady | strong | locked`), decisions and scope.
  - **PhilosophyChange:** rev, kind (`sharpened | added | retired | reworded`), text, evidence, status.
  - **LearnedRule:** id, phase, text, evidence (run ids and score deltas), status (`proposed | active | retired`).
  - **PromptVersion:** id, recipe, version, parent_id, template, status, and score stats.
- **Consolidation from the review:**
  - One `proposal` table holds design-system proposals, philosophy changes, learned rules and prompt-template edits. Its fields are target_kind, target_id, base_version, diff_hash, rationale, evidence and status.
  - One `link` table `(from_kind, from_id, rel, to_kind, to_id)` holds evidence and provenance, queryable in both directions. A principle's decision count is derived from links, not stored.
  - `token_count(hash, model_family, tokens)` caches `countTokens` results.
  - Nodes and edges carry a `createdSeq`, so playback can rebuild in creation order.
  - Every canonical JSON carries `v` and is upgraded when read.
- **Memory tiers map onto tables:**
  - **Working** is assembled per run and only its hash and record are stored.
  - **Project** is PhaseOutput, HypothesisBlock, Run, Score and Decision.
  - **Craft** is LearnedRule, PromptVersion, the foundations tables and taste references.

## 3. Node type system

The four port types match Figma:

| Port | Carries | Accepted by |
|---|---|---|
| `context` | raw items from a source | Claude `context` |
| `phase_output` | locked artifact, colored by phase | Claude `context`, Hypothesis `evidence` |
| `hypothesis` | active block | Claude `hypothesis` |
| `text` | Claude output | Output `text`, Claude `context`, Hypothesis `evidence` |

- **Compatibility is a static matrix** in `engine/ports.ts`. A mismatch returns a reason string, such as "Context can't feed a hypothesis. Wire it into a Claude node instead." The UI shakes the node and shows that reason.
- **Four kinds, extensible subtypes.** Node kinds stay at four, and subtypes come from a registry.
  - **Source subtypes:** file, image, link, quote or paste, transcript, linear, figma, arena, pinterest, mobbin (link or screens), 60fps, request, data or metric, slack_thread, statsig_result.
  - **Claude recipes, one per phase:**
    - Understand: `synthesize_insights`.
    - Define: `draft_statement`, with frame hypothesis, problem, HMW or user statement.
    - Build: `prototype`, with fidelity and target code or Figma.
    - Validate: `test_strategy` and `verdict`.
    - Share: `release_story` and `pr_description`.
  - Each recipe declares its phase charter, prompt template (a versioned PromptVersion), output schema, effort and preview renderer.
- **Output contract.** Each phase's Output node requires a specific artifact kind:
  - Understand: weighted_context.
  - Define: testable_statement.
  - Build: prototype.
  - Validate: verdict.
  - Share: release_story.
- **Locking** validates that contract, writes a PhaseOutput, takes a snapshot, and exposes the output as the next phase's inlet.
- **Node anatomy** from 02 Nodes:
  - A header with a type glyph, title, kind tag, and in and out ports.
  - A body with a thumbnail or preview.
  - A footer with status, version, lock state and phase link.
  - Claude node states: idle, running (progress bar), stale (amber, "Inputs changed · rerun") and over budget (red, "Context 212k / 200k").
  - Source visual variants: Pinterest grid, Mobbin screens, Interviews waveform with a quote, and Linear ticket.

## 4. Execution engine (`packages/engine`, pure TS)

The engine gets `llm`, `repo`, `clock`, `ids` and `sink` injected. Its API is `canConnect`, `inputKey`, `status`, `blastRadius`, `plan(target, 'pull'|'push')` and `Scheduler.execute(plan) → handle.cancel()`.

- **Graph rules:**
  - The graph is a DAG. A connect is rejected if the target can already reach the source.
  - Edges stay inside a phase region; only an inlet crosses phases.
  - The phase loop is never an edge. Locking a "miss" verdict creates loop N+1 with a new Understand region whose inlet points at the verdict version. Sources can carry forward with the same `lineageId`, and earlier loops become read-only.
- **inputKey:** H(node entry hash, template version, model, effort, budget, inputs sorted by alias, envKey). Each input contributes:
  - a source: content + weight + pin
  - a Claude node: its current output hash
  - a hypothesis: its block id
  - an inlet: its version id

  Keys are memoized per manifest hash.
- **Status:**
  - **stale** means the key differs from the last successful run's key, or an upstream node is stale.
  - **stale_env** means only foundations or craft rules changed. It's a softer badge, so approving a rule doesn't paint the whole canvas amber.
  - Other states: idle, running, over_budget, error.
- **Blast radius:**
  - Apply the change to a copy, collect the nodes whose key changes, and take their descendants.
  - Propagation stops at locks, which are reported as "would need relock".
  - The affected nodes turn amber before anything runs.
- **Scheduling:**
  - **Pull** (⌘↵) runs the node plus its stale ancestors, stopping at locks.
  - **Push** ("Fork and rerun") writes the fork snapshot, applies the change, then runs the blast-radius set in topological order. It stops at Output nodes and offers "Lock v4"; it never locks automatically.
  - A ready queue runs up to 3 calls at once, with one AbortController per run.
  - A failure marks its dependents skipped.
  - Re-running a node cancels its older run (latest wins).
  - Run rows are written as `running` when they start. Leftover `running` rows become `interrupted` on boot, and cancelled runs keep their partial output.
- **Locked outputs never change silently.** The Output node shows "v4 available" and the next phase keeps consuming v3 until Andrew locks v4.
- **Streaming:**
  - Deltas buffer outside React in a sink that flushes to a `streams` slice once per animation frame.
  - Nodes select by run id, so React Flow never re-renders the whole graph.
  - The output blob, run row and snapshot commit in one transaction.
- **Snapshots** are written at run end (success, error or cancel), lock, swap, fork and ⌘B. A run also stores its `input_manifest`.
- **Undo** (⌘Z) is a stack of manifest hashes and never deletes runs or snapshots. ⌘Z right after "Fork and rerun" sets the branch to `merged_back` and moves the head back. The fork's runs stay visible on the timeline.
- **History views:**
  - **Playback** frames are the snapshots from root to head. Between frames, the manifest diff reveals added nodes and edges in `createdSeq` order. "Runs only" keeps run frames, and idle gaps are capped at about 1.5s before the speed is applied.
  - **Compare** produces typed changes from the manifest diff: added, wired, weight, swap (with variable from→to) and template version. It adds a run diff: rules added or removed, foundations, and average score with n.
- **Budget:** `countTokens` runs once per (content hash, model family) and is cached, then split across units. Totals are checked against `usage.input_tokens` with a 3% margin. Over budget blocks the run.

## 5. Prompt assembly (`packages/engine/src/prompt`)

### Layout

Blocks are ordered by how often they change, using all 4 cache breakpoints. The 1-hour TTL comes first, as the API requires.

```
system[0] Composer charter + phase charter (versioned template)
system[1] Foundations: design system vX, philosophy rev N (numbered principles)  ◆BP1 ttl 1h
system[2] Phase craft rules, tagged "[R12] …" (ids recorded on the run)          ◆BP2
user      Project memory: earlier locked outputs (verbatim), hypothesis chain
          with failed siblings and their results, decisions, pinned items      ◆BP3
user      Active hypothesis + weighted context (trimmed documents)               ◆BP4
user      Instruction (rendered template) + output format
```

- **Determinism:** sorted keys, no timestamps or relative dates, integer percentages. A golden test checks that changing a weight leaves the bytes before BP3 identical, and changing the instruction leaves the bytes before BP4 identical.
- **Cache logging:** every run stores `cache_read_input_tokens`, and the inspector shows the hit rate.

### Weights to tokens: trimmed, never summarized

- **Units at ingest.** Every item is split into atomic units: an utterance, a comment, a frame plus caption, a metric row.
- **Weighted water-filling** across the budget:
  - Default weights are Mute 0, Light 1, Normal 2.5 and Heavy 4, tunable in settings.
  - Any item that fits its share is taken whole, and the surplus is redistributed.
  - Pins sit outside the budget, capped at about 15% of it.
- **Choosing units.** Within its share, an item keeps units in salience order:
  1. user-starred quotes
  2. BM25 overlap with the instruction and hypothesis variables
  3. original order

  A unit is never split, except a single unit larger than its whole share. That one is cut at a sentence boundary and marked.
- **Output** keeps the original order, with markers like `[… 9 utterances omitted, 12:03–18:40 …]`. No LLM is involved, so the result is deterministic, cacheable and testable.
- **AssemblyReport blob, per run:** for each item, weight, share, demand, tokens used, and the kept and dropped ranges. It drives the "Heavy 54% / Normal 34% …" bar and the "show trimmed" view, which lists the dropped units verbatim.
- **Tags:** every document is wrapped as `<doc alias="interviews" source="…" weight="heavy" pinned="true" why="The brief we ship against.">`. The charter tells Claude that documents are data, not instructions.

### Instruction templates

- **Resolving `{name}`:** first the edge aliases on the node, then chain labels (`{H2}`), then reserved names (`{pins}`, `{rules}`, `{hypothesis}`). `{{` escapes a brace.
- **Problems before the run:**
  - An unknown name is an error.
  - A wired input the template never mentions is a warning, and it's still included.
- **Rendering:** a reference renders as "the `<interviews>` document". Content is never pasted at the reference site, which keeps the prefix cacheable.
- **Editor:** references are highlighted as in the Figma inspector.

### Request settings

- **Model and thinking:** `claude-opus-5-5`, adaptive thinking with `display: "summarized"` under a Thinking disclosure, so a run never looks stalled. Effort is set per recipe and is part of the cache key. `max_tokens` is 64000, always streaming.
- **Refusals:** `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`. `stop_reason` is recorded, and a refusal shows on the node with its explanation.
- **Output format:**
  - Structured outputs (`output_config.format`) for Define, Validate and Share, with partial JSON streaming into the preview.
  - The tool runner for Build, with `eager_input_streaming` and schema validation of each tool input.

## 6. Connectors (direct APIs, tokens in Keychain)

| Connector | How | Gives |
|---|---|---|
| Files / images / transcripts / paste / links | drag-drop, ⌘V, URL fetch + readability + OG image | ContextItems + thumbnails |
| Linear | GraphQL API, personal API key | tickets, comments, labels |
| Figma | REST, personal access token | frames by link → PNG thumbnails, frame text |
| Are.na | REST (token optional) | channel blocks |
| Pinterest | public board RSS (`/<user>/<board>.rss`) | pins + images |
| Slack | user token, `chat.postMessage` + `conversations.replies` | Validate feedback out, replies back as context |
| Statsig | Console API key | experiment results for Validate |
| GitHub | `gh` CLI | Share PRs |
| Mobbin, 60fps, Granola | links, screenshots, exported transcripts | ContextItems |

- Syncs cache by remote `updated_at` or ETag, so a synced source counts as a stable input.
- Nothing posts to Slack or opens a PR until Andrew presses the button.

## 7. Build: code and Figma

- **Variants by default.** Build lays out three prototype nodes side by side, each taking a different direction on the same brief (direct, structural, expressive). Each is a `prototype` Claude node with `options.direction` and `options.round`; aliases are `variant-a`, `variant-b`, and so on.
  - **Add direction** adds a fourth (minimal, or any other) to the latest round.
  - **Fork** a variant into the next round: three new nodes (refine, layout, tone) that are wired to the same feeds plus the forked variant, whose HTML rides in as context. Forking is a choice, so it is also recorded as picks of that variant over its siblings.
  - **Use** points the key node at a variant; only one ships.
  - The **variants board** (B, or Variants in the toolbar) shows every round, with run, open, use and fork per card, and a pairwise comparison mode.
- **Code prototype.** The `prototype` recipe returns one self-contained HTML document (inline CSS and JS, no network) as structured output, not a React app or an esbuild bundle.
  - It renders in a sandboxed iframe (`sandbox="allow-scripts"`, opaque origin), written to the app data dir by the `prototype_write` command in Tauri or served as a blob URL in the browser (`apps/desktop/src/prototype/runtime.ts`).
  - Composer talks to the frame only by `postMessage`: `{composer:"rt", id, op}` requests and `rt-reply` / `rt-event` messages back.
  - Fidelity sets the constraints:
    - Low-fi: grayscale boxes.
    - Wireframe: structure plus real copy.
    - High-fi: full tokens.
  - An on-system lint compares computed styles against design system tokens. That drives the "94% on-system" stat and the drift proposals.
- **Interaction kit** (`apps/desktop/src/prototype/kit.ts`, documented to Claude in `packages/engine/src/kit.ts`). Injected into every prototype, so Claude writes markup and data attributes instead of logic:
  - Screens and navigation: `data-screen`, `data-go`, `data-transition`, `data-back`.
  - Sheets, toggles, tabs and toasts: `data-sheet`, `data-close`, `data-toggle`, `data-tab` / `data-panel`, `data-toast`.
  - Sample data: `<template data-repeat="people|messages|tasks|products" data-limit>` with `data-sample` fields.
  - The same script serializes the DOM for Figma, and runs the tweak and note modes below.
- **Direct tweaks, no rerun.** The prototype studio (Open on a variant) has Interact, Tweak and Note modes.
  - Tweak: click an element, change its copy, color, fill, font size, weight, padding, gap or radius. The kit applies each as an inline style.
  - Save exports the edited document (kit tags and ids stripped) and stores it as a new artifact for the same run: keys don't change, so the node stays fresh and only downstream goes stale. Each save logs an `edit_output` decision listing the changes.
- **Figma output.** "Send to Figma" serializes the prototype's DOM in the iframe (boxes, flex as auto layout, text, fills, radii, with token matches) into a `{composer:"figma-frames", v:1, title, tree, tokens}` payload on the clipboard. In Figma, the companion plugin's "Paste from Composer" builds the frames.

## 8. Share: creative output

- **Release story artifact.** Claude scripts four chapters from the snapshot chain:
  1. **The problem:** the heaviest quote, in animated type.
  2. **The process:** the real graph rebuilding itself from history.
  3. **The UI:** the prototype running in a device frame, with a scripted cursor and taps.
  4. **The proof:** metrics animating against the hypothesis. When the evidence gives numbers, each metric is charted with D3 scales: the observed change, its confidence range and a target line, one shared axis per unit.
- **Renderer:** `packages/renderer` is a Remotion project.
  - It imports the same node components as the canvas, so the process chapter is the actual graph rather than a mock.
  - It also renders the React prototype directly.
- **Exports:** MP4, plus a GIF cut and poster still for Slack, Linear and PR embeds.
  - **Voiceover:** a Claude-written script read by macOS speech by default. It can use ElevenLabs if a key is added.
  - **Captions** are burned in.
  - Composer runs the render with the system Node through a scoped shell command.
- **In-app player.** The same composition plays through `@remotion/player`, with Preview / Share as in Figma.
- **Motion.** The story carries `motion`: the transition between chapters (fade, slide, wipe or cut, through `@remotion/transitions`) and optional seconds per segment. Transitions overlap neighbouring chapters, so the timeline subtracts them. The UI chapter's cursor trails with `@remotion/motion-blur`.
- **Reference video.** In Share, a video can be wired into the release story as a source. `reference.ts` reads it with Remotion's own ffmpeg: tiny grayscale frames, ten a second, compared one to the next to find cuts, then up to ten stills. Claude sees the rhythm in words and the stills as images, and sets the transition and pacing to match. Remotion's ffmpeg build has no scene or fps filter, which is why the cuts are found in code.
- **Delivery check.** After the MP4 renders, ffprobe reads it back and the result is compared with the composition: size, frame rate, length and whether the voiceover made it in. The Share view shows the summary, or what's off.
- **PR path:** `gh` creates a branch, commits the prototype and GIF, and opens the PR with a Claude-drafted description: before/after, rationale and metric.

## 9. Foundations and improvement loop

- **Design system slot:**
  - Versioned and read-only to Composer.
  - It imports from `tokens.json` or `.md` (Sundial seed) and shows tokens, components, type styles and "Build output on-system %".
  - **Drift detection:** the same token overridden 3 or more times across 3 or more builds becomes a proposal with a diff, affected components and evidence.
  - Andrew reviews each proposal with Accept, Edit value or Reject. Reject asks "wrong value or wrong idea?" and the answer feeds the philosophy.
  - Accepted proposals create DS v+1, with a changelog entry and an optional PR to the design system repo.
- **Philosophy slot:**
  - Seeded from slingshot-design-philosophy.
  - Principles have strength and decision counts, with a changelog of sharpened, added, retired and reworded entries.
  - "Forming" candidates wait for approval.
- **Improvement loop:** Run → Validate → Score or pick → Propose → Replay → Approve.
  - After each Validate verdict, a Reflect job compares high- and low-scored runs and the designer's pairwise picks, using prompt versions, context patterns and decisions.
  - It needs at least 5 scored runs on each side, or 5 pairwise picks, in a phase before it proposes a rule there, and it always shows n, to avoid overfitting.
  - It drafts LearnedRules, PromptVersion edits and philosophy changes, each with stats such as "4.3 vs 2.7 avg".
  - Andrew answers each with "Keep rule" or "Not yet". Nothing goes live without approval, and every change can be reverted from History.
- **Sidebar:**
  - Memory shows the active and retired hypotheses, the count of learned rules, and the weighted context version.
  - Memory health shows the latest learned rule.

## 10. UI build-out (match Figma closely)

Since DC-1 the UI runs on its own design system: 15px body type, a spacing scale, shared components and Lucide icons, all described in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). The sizes below are the current ones. They're about 1.25× the Figma frames, which were drawn at 12px, so check layout and hierarchy against Figma, not pixel sizes.

- **Window (01 Workspace):**
  - **Title bar, 48px:** overlay traffic lights, then project / phase, then "Saved · snapshot N".
  - **Phase rail, 64px:** five phases with status and output, the loop indicator, and the Focus toggle.
  - **Sidebar, 272px:** ⌘K search, Sources, Memory, Foundations and Memory health.
  - **Canvas:**
    - 35px grid with 10px snap. Stored positions are drawn 1.25× apart (`CANVAS_SCALE`).
    - Technical overlay with rulers, coordinate readout and corner brackets.
    - 35px inlet and outlet rails.
    - Floating toolbar: Select V, Pan H, Add node N, Comment C, zoom.
    - Minimap.
  - **Inspector, 368px:**
    - Tabs: Preview, Prompt, Node.
    - Live output preview.
    - Context section with a budget bar, "Always on" foundations, and context chips with toggles.
    - Instruction editor.
    - Run node ⌘↵ and Snapshot ⌘B.
  - **History bar, 176px:**
    - Transport: play, step, speed.
    - Snapshot N of M.
    - Bookmarks, Branches and Compare.
    - Phase-colored timeline with run ticks, bookmark flags, branch curves and the playhead.
- **Focus mode:** the active phase fills the canvas, and neighbors collapse to the inlet and outlet rails. With Focus off, all five regions sit side by side as React Flow group nodes.
- **Interactions (05):**
  - **Snap:** 24px radius to a matching port. The port glows and shows "Release to wire as context". The wire draws in 180ms ease-out on the 8px grid, and a context chip appears in the inspector. Holding ⌥ drops without snapping.
  - **Swap:** ⇄ opens candidates ranked by evidence. The blast radius turns amber before anything runs, then "Fork and rerun ⌘↵".
  - **Bookmark:** ⌘B suggests a name. ⇧← and ⇧→ jump between bookmarks.
  - **Scrub:**
    - Hovering the timeline shows a thumbnail, and scrubbing snaps to runs.
    - Playback is read-only. Space plays at 2×, and "Runs only" skips idle time.
    - "Branch from here" or Esc exits playback.
- **Tokens** (from Figma variables):
  - **Backgrounds:** bg/app #0a0a0b, bg/canvas #0d0d0f, bg/panel #121214, bg/raised #19191c, bg/hover #232327.
  - **Borders:** border/subtle #202024, border/strong #34343a.
  - **Text:** text/primary #eeedea, text/secondary #a29e94, text/muted #69665e, text/inverse #0b0b0a.
  - **Phases:** phase/understand #de8a45, phase/define #e05a4e, phase/build #9887e3, phase/validate #52acd9, phase/share #55c98e.
  - **Signals:** signal/live #55c98e, signal/hypothesis #e3c25a, signal/retired #5a5852.
  - M1 pulls type, spacing and radius values with `get_design_context` on the components: Node/Source, Node/Claude, Node/Hypothesis, Node/Output, UI/Source row and UI/Context chip.


## 11. Workspaces and key nodes

- **Key node.** Every phase ends in one Output node in output mode: the key node. Its fields are fixed per phase (`HANDOFF_SCHEMA` in `packages/engine/src/handoff.ts`), so the next phase always receives the same shape.
  - It is pinned top right in every phase, canvas or workspace, as a dock that folds to its header. It shows the status (draft, locked vN, newer draft), each typed field with missing required fields marked, and where the handoff goes ("Goes to Build", "Loops back to Understand").
  - **Prompt preview, the point of the dock.** It shows the exact `<doc>` block the next phase's prompt will read. Once the next phase's inlet points at the locked version, the block is pulled from that node's live assembled prompt, so trimming shows too; before that it is built with the same `docTag` the assembler uses.
  - **Edit handoff.** The designer can rewrite the text the next phase reads. Before a lock the edit waits on the key node (`draft.text`) and ships with the lock; after a lock it becomes a new version (`edited: true`), the next phase's inlets move to it, and an `edit_output` decision is logged.
  - Lock is blocked until every required field has a value.
- **Define: writing workspace.**
  - The statement is the hero, in the fixed form **we believe / for whom / we'll know when**, written on paper. `StatementData.form` holds it; older artifacts fall back to their parts.
  - **Evidence rail** on the left: the locked Understand insights and the heavy or pinned Understand sources. **Cite** adds the item to the evidence the statement rests on and records it on the key node (`cites`).
  - **Variants** beside the statement: Claude drafts two more versions from other angles, plus alternates in the other frames. **Use this** loads a variant into the form and logs a `keep_variant` decision.
  - Live checks while writing: testable, specific user, measurable, cites evidence.
  - Each line can carry a note to Claude (a field-anchored note) for the next draft. The working draft lives on the key node (`draft`), so it survives reloads.
  - **Lock** builds the statement from the form (`defineArtifact`) and, for the hypothesis frame, enters it into the memory chain as before.
- **Validate: scorecard.**
  - The locked statement is pinned on top, read-only.
  - A metrics table: kind, metric, target (`StrategyData.metrics[].target`), observed and met, filled from the verdict once it has run.
  - One lane per method (Slack, 360 sessions, Statsig, survey) with Claude's plan, its questions, the action (post to Slack, add session notes, pull a Statsig experiment) and the evidence that has landed in that lane.
  - The verdict bar ends it: Claude's reading, then the designer's call, **Holds → Share** or **Misses → Understand**. Overriding Claude's reading is allowed and logged.
- **The graph stays.** Both workspaces read and write the same nodes, edges and outputs; G or the Writing/Scorecard ↔ Graph toggle shows the canvas underneath. Playback always shows the graph.

## 12. Evals: training the loop with feedback

- **Scores** (1–5 per run) as before.
- **Pairwise picks** (`pick` table). The designer saw two outputs of the same brief and preferred one:
  - Compare in pairs on the variants board, round by round.
  - Better / Same / Worse against the previous run of the same node, in the inspector.
  - Forking a variant (an implicit pick over its siblings).
  - Picks go to Reflect as `<pairs>` blocks, the sharpest evidence it gets. Five picks in a phase are enough to propose a rule there.
- **Feedback pinned to the output** (`ClaudeNode.notes`). A note anchors to a point on a prototype (screen, x, y and the element under it) or to a field of the Define statement. Notes on the current output ride into the node's next run as a heavy `notes` document and are part of its key, so adding one marks the node stale. After the rerun they no longer ride along.
- **Replay** (`replay_case`, `replay_result`, `packages/engine/src/replay.ts`). Before a proposed rule or principle goes live:
  - Composer reruns up to four kept briefs with the change. A run's prompt is stored whole, so a replay changes exactly one system block (the rules block, or the philosophy inside foundations) and keeps everything else as the designer saw it.
  - Briefs are kept by hand ("Keep as replay brief" in the inspector) or, when none are kept for the phase, picked automatically from the highest-scored and picked runs.
  - The proposal card shows baseline and candidate side by side (prototypes render live), the designer judges each brief, and the tally reads "Candidate preferred on 3 of 4". Keeping stays the designer's call; replay is evidence, not a gate.
  - Design system proposals don't replay; they lint instead.
