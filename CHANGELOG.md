# Changelog

Newest first. Every milestone adds an entry. A **Decisions** list records each default picked without asking, so it can be revisited.

## In-app updates · 2026-11-05

### Added
- **Composer updates itself from GitHub Releases:**
  - **Checks quietly** 5 seconds after launch, then every four hours. A check that fails stays silent; Settings says why.
  - **Title-bar pill:** "Update ready · v0.1.1 · Restart". Clicking it downloads the signed update, installs it and relaunches, with progress in the pill.
  - **Never cuts off work:** if a Claude run, Reflect or a video render is in flight, the pill shows "Waiting" and Composer restarts when it finishes. Click the pill to cancel; the download is kept.
  - **⌘K → Check for updates.** Once an update is found it becomes "Restart to update to v0.1.1".
  - **Settings → Updates:** the running version, when it last checked, and any error, with Check for updates, Restart to update, or Don't restart yet.
  - Pending edits are saved before the relaunch.
- **Release workflow** (`.github/workflows/release.yml`): pushing a `v*` tag checks that the tag matches the app version, runs `pnpm check`, builds one universal app (Apple Silicon and Intel), signs the update and publishes a GitHub Release with the `.app.tar.gz`, its `.sig` and `latest.json`.
- **README:** how to cut a release, the one-time signing secrets, and how to install from a release.
- **Browser preview:** updating is a no-op without Tauri. `?update=0.1.1` scripts a found update; `?update=latest`, `?update=error` and `&install=error` script the other outcomes.
- **Tests:**
  - **The update lifecycle:** quiet and manual checks, the launch delay and interval, waiting for a run, a run starting during the save, cancel, a double-clicked Restart, and retrying a failed download, install or relaunch.
  - **Against the real stores:** a restart waits for a Claude run, Reflect or a video render, and saves the working graph first. Also the ⌘K entry, and that a development copy never checks on its own.
  - **The updater:** download progress from the Tauri plugin, and each scripted outcome in the browser preview.
  - 167 in total.

### Changed
- **The title bar's two sides share the spare width** instead of 420px each, so the update pill, the Guide pill, the panel toggles and the save status fit at the default window size. The project name stays centered.
- **The app bundle is ad-hoc signed** (`signingIdentity: "-"`), so a copy downloaded from a release opens after the one-time Gatekeeper approval instead of being reported as damaged.

### Decisions
- **Updates are signed with a minisign key.** The public key is in `tauri.conf.json`. The private key lives at `~/.tauri/composer-updater.key`, its password in Keychain, and both go in as GitHub secrets. Neither is in the repo.
- **Updater bundles are switched on by `tauri.release.conf.json`**, which only the workflow passes, so `pnpm tauri build` still works locally without the key.
- **The tag must match `version` in `tauri.conf.json`**, or the workflow stops before building.
- **Releases are published, not drafted.** Pushing the tag is the go-ahead, and `releases/latest` doesn't see drafts.
- **One universal build in one job.** It compiles Rust twice, but Actions minutes are free on a public repo and one download works on either Mac.
- **Download first, then wait:** clicking Restart downloads straight away. Only the install and relaunch wait for running work.
- **Dev builds (`pnpm dev`) don't check on their own**, so a development copy never offers to replace itself. ⌘K still checks.
- **No release notes in the app yet.** The release body links to this changelog.
- **Verification:**
  - In the browser preview, against the scripted updater: the pill appeared from the quiet launch check; Restart during a scripted Claude run waited, then restarted when the run ended; cancel kept the download; plus up to date, a failed check, and a failed install with Retry. No console errors.
  - A local build with the release config produced the `.app.tar.gz` and `.sig`. The signature verifies against the public key in `tauri.conf.json`, and the app's ad-hoc code signature is valid.
  - Not yet verified: a real install and relaunch through Tauri. That first happens when a copy with this change sees the next release.
  - On `main`, a fresh checkout fails `pnpm check` because `.gitignore`'s `build/` rule drops `apps/desktop/src/build/`. Until that's fixed (the workspaces branch moves it to `src/prototype/`), the workflow stops at `pnpm check` and publishes nothing.

## M11 · Workspaces, key nodes, Build variants and evals · 2026-11-05

### Added
- **Define is a writing workspace, Validate is a scorecard.** Understand, Build and Share stay node graphs. G flips a workspace to its graph and back, and ⌘K has "Show graph".
  - **Define:** the statement is the hero, written as we believe / for whom / we'll know when. An evidence rail on the left lists the insights from Understand and the heavy or pinned sources, and Cite adds a line to the statement's evidence. Claude's variants sit beside the statement with "Use this", plus the alternate frames. Lock is on the statement.
  - **Validate:** the locked statement is pinned at the top. A metrics table lists success, guardrail and kill lines with their targets, what was observed and whether each was met. One lane per method (Slack, 360, Statsig, survey) holds its action and its evidence. The verdict bar ends in Holds → Share or Misses → Understand.
- **A key node in every phase:** a dock on the right shows the phase's single output, its fields (missing ones marked), where it goes next, and a preview of the prompt the next phase will read, with a token estimate.
  - **Edit handoff** changes the text the next phase reads without a rerun. "Reset to Claude's" goes back.
  - Lock is disabled until the required fields are filled.
- **Build variants by default:** a new Build phase starts as three variants in different directions, all fed by the statement. B opens the variants board.
  - **Rounds:** Fork a variant to start the next round from it. Add a direction to a round. Run a round in one go.
  - **Use** makes a variant the key node.
- **Interaction kit:** prototypes are one HTML document with screens and data attributes for navigation (`data-go`, `data-back`), tabs (`data-tab`, `data-panel`), repeated sample rows (`data-repeat`) and toasts (`data-toast`), so they click through without real logic.
- **Prototype studio:** opens a variant full height with three modes.
  - **Interact:** click through it.
  - **Tweak:** pick an element and change its color, background, font size, padding, gap, radius or text. Save writes the new HTML with no rerun.
  - **Note:** pin a note to a spot on a screen. "Rerun with N notes" sends them with the next run.
- **Notes on the statement:** ◎ beside each line of the Define form pins a note to that field.
- **Evals:**
  - **Pairwise picks:** "Compare in pairs" on the variants board walks every pair in the latest round. "Vs last run" in the inspector rates a rerun Better, Same or Worse.
  - **Replay:** a proposed rule or principle can be replayed on past briefs before it is kept. Baseline and candidate sit side by side, and each brief is judged Baseline better, Same or Candidate better. "Keep it" shows when the tally favours the candidate.
  - **Keep as replay brief** in the inspector adds a run to the replay set.
  - Reflect counts picks as evidence alongside scores.
- **Tests:** 155 in total.

### Changed
- **ARCHITECTURE.md:** section 0 has a Surface column, section 7 is rewritten for variants and the HTML prototype, section 9's loop includes picks and replay, and new sections 11 (Workspaces and key nodes) and 12 (Evals).
- **The guide** mentions the key node, the writing workspace, variants, the scorecard and replay.
- **The scripted dev model** (`?fake`) returns a different prototype per direction, metric targets, and statement variants.

### Fixed
- **`src/prototype/runtime.ts` was missing from the repo**, because `.gitignore`'s `build/` pattern caught its old folder. It is rebuilt at `src/prototype/runtime.ts`.
- **⌘L in Define** locks through the statement form.
- **`src/ui/build/` was missing from the repo too**, for the same reason. `.gitignore` now ignores only a top-level `/build/`.
- **Define's statement slid under the key node** when the sidebar and inspector were open, because the evidence rail and statement needed more width than was left beside the dock. When the space is too narrow, the evidence now sits under the statement, and in very narrow windows each label sits above its line.
- **The prototype studio let the variants board show through.** Its background is solid now.

### Decisions
- **The first round has three directions:** direct, structural and expressive. A fork's round uses refine, layout and tone.
- **Replay picks up to four briefs** on its own from scored and picked runs when none were kept for that phase.
- **Five picks in a phase are enough** for Reflect to propose a rule there.
- **Replay is evidence, not a gate:** you can keep a change without replaying it.
- **A tweak keeps the run's cache keys,** so the variant stays fresh with no rerun. Whatever reads it downstream sees the new HTML and goes stale. A rerun replaces the tweaks.
- **Only notes on the current run** ride into the next run, so old notes don't pile up.
- **Not run here:** `pnpm tauri build` (needs macOS) and a visual check in a browser (no headless browser in this environment). `pnpm check` and `vite build` pass.

## Collapsible panels · 2026-11-04

### Added
- **Collapse and expand the sidebar, inspector and history bar:**
  - **Title bar:** three layout toggles beside the save status (sidebar, history, inspector), filled in when a panel is showing.
  - **Shortcuts:** ⌥⌘← sidebar, ⌥⌘→ inspector, ⌥⌘↓ history. ⌘\ hides every panel, or brings them all back, like Figma's hide UI.
  - **⌘K:** "Hide sidebar", "Show inspector" and so on, plus "Hide all panels".
  - **Keyboard map:** a Panels group.
  - The canvas takes the freed space, and the layout is remembered between launches.
- **The guide reopens a panel when a step points into it:** the inspector for run, score and lock, the sidebar for foundations, the history bar for the tour.

### Fixed
- **The title bar's right side has room for the Guide pill**, the toggles and the save status, so they no longer wrap or clip.

## Guide: first-run tutorial · 2026-11-04

### Added
- **A step-by-step guide** that opens on first launch and walks a new person from setup through their first real loop.
  - It points at the real controls with a ring and a card beside them; the app stays fully usable underneath.
  - Steps tick themselves off as you do them. A step that's already done (a key in Keychain, a renamed project) is skipped.
  - **Set up:**
    - **Connect Claude:** opens Settings and rings the API key field.
    - **Slot your foundations** and **Connect your sources:** both optional, with "Skip for now".
  - **Your first loop:**
    1. Name the problem, from the card or by double-clicking the title.
    2. Bring in context: your own files or links, or **a sample interview** for people with no material handy.
    3. Weigh a source.
    4. Run Synthesize insights.
    5. Score the run.
    6. Lock the weighted context.
    7. Draft and lock a testable statement in Define.
  - **Finish:** a tour of the rest of the loop (Build, Validate, Share, the history bar), then ⌘K and ?.
  - Each step teaches the keyboard way, and has a button that does the action for you.
- **Leave and come back:**
  - **Exit guide** pauses it, and a "Guide · 6 of 13 · Resume" pill appears in the title bar.
  - ⌘K offers "Tutorial: resume the guide" and "Tutorial: start from the beginning".
  - Progress is saved, so a restart resumes where you were.
- **Placement:** the card sits beside what it points at, otherwise wherever covers the least of it. It never runs off screen in a small window.
- **Tests:** step progression, auto-skip of finished steps, going back without bouncing forward, pausing, progress counts, and card placement. 131 in total.

### Changed
- **Removed the outlined phase name** ("UNDERSTAND", "DEFINE"…) along the bottom of each canvas section.
- **The "Add your API key" banner** stays hidden while the guide is running, so the key step is the only prompt.

### Decisions
- **The guide doesn't dim the app between steps.** Only welcome and finish use a scrim. Every other step leaves the app usable, because doing the step is the point.
- **The sample interview is fictional** and ships in the app (`tutorial/sample.ts`), so the first loop works without any material of your own.
- **Verification:**
  - The whole guide ran on a fresh database in the browser preview with the scripted model:
    - Every step completed itself on the real action, from naming through locking the statement.
    - Exit, the title-bar pill, ⌘K resume and Finish all work.
  - The API key step was skipped rather than given a key. Its completion is covered by tests.

## M10 · Polish and packaging · 2026-11-04

### Added
- **⌘K search** (also the sidebar's search field):
  - Jumps to any node in the current loop, a hypothesis, a locked output or a bookmarked snapshot, and runs any action: go to a phase, run, comment, bookmark, focus, playback, compare, Foundations, Reflect, settings.
  - Every typed word must match, with word-start matches ranked first.
  - Arrow keys and Enter.
- **Keyboard map** (`?`): every shortcut, grouped by run and lock, canvas, history and app.
- **Comments** (tool **C**):
  - Click the canvas to pin a note. Double-click to edit, drag to move, × to delete. An empty note disappears when you leave it.
  - Notes are kept per project, phase and loop. They annotate the work and never reach a prompt or a snapshot.
- **Empty and error states:**
  - A phase with nothing in it says what unlocks it ("Define starts from a locked weighted context"), with Go to Understand and Add node.
  - If the database can't open, the canvas explains it, says where the data lives and that nothing was changed, and offers Try again.
- **App icon:**
  - A node card with the five phase colors as its header bar, wired in orange and out in green, on the canvas grid.
  - The source is `src-tauri/icons/icon.svg`. `packages/renderer/icon.ts` renders it through the same Remotion pipeline, and `pnpm tauri icon` builds the set.
- **Packaging:** `pnpm tauri build` produces `Design Composer.app` (release build with LTO, about 10 MB).

### Changed
- **The Share views load on demand.** Remotion and the player are split out of the main bundle, so the app starts without them.

### Decisions
- **The bundle is the `.app` only.** Tauri's DMG step lays out the window by scripting Finder, which timed out on this machine. A DMG isn't needed to use the app daily. Add `"dmg"` back to `bundle.targets` to share it.
- **No separate performance pass** beyond the bundle split. Statuses and keys are memoized per manifest, streaming deltas flush once per frame, and the release build uses LTO. A profiling pass on a large real project is still to do.

## M9 · Foundations and the improvement loop · 2026-11-04

### Added
- **Two always-on slots** (Figma 06), versioned in the Craft tier and shared across projects:
  - **Design system:**
    - Imported from a token reference and its usage guide (markdown). A generic table parser reads color ramps, semantic tokens in both modes, the type scale, spacing and radii, and finds component names in the guide.
    - Read only to Composer: it changes only through an accepted proposal.
    - Seeded from Sundial 2.0: 155 tokens, 16 type styles, 10 components.
  - **Philosophy:**
    - Imported from the designer's own writing. The "How to apply" list becomes the numbered principles, and the full text rides along in every prompt.
    - Each principle shows its strength (forming, steady, strong or locked) and the decisions behind it.
    - **Edit principles** saves a new rev, and Lock keeps a principle out of future proposals.
- **Every run carries the foundations:**
  - The cached foundations block of the prompt now holds the principles, the philosophy text, the usage guide and the exact token values.
  - Each phase's kept rules ride in their own block.
  - Runs record the foundation versions and rule ids they used.
  - When a slot or a rule changes, affected nodes turn **stale_env**: a dashed, softer badge reading "Foundations or rules changed", not the full stale amber.
- **Detect → propose → review → log:**
  - Every on-system check of a prototype is stored. The same off-system value used at least 3 times across at least 3 builds becomes a proposal: change the nearest semantic token, or add a new one.
  - **Review** shows before and after, with **Accept**, **Edit value** and **Reject**. Reject asks "wrong value, or wrong idea?", and a wrong idea is recorded as a taste decision.
  - Accepting writes the next design-system version with a changelog entry. Every resolution is a decision row.
- **Scoring:** a 1–5 control under every finished run in the inspector ("how close to what you'd ship?").
- **Reflect** (the improvement loop):
  - Runs after each Validate verdict, once some phase has at least 5 runs scored 4–5 and 5 scored 1–2. **Reflect now** runs it on demand.
  - One structured Claude call compares the high and low runs (instructions, outputs, notes) and the designer's recorded decisions.
  - It drafts craft rules with their evidence and stats (for example "4.6 vs 1.4 avg · n 5/5") and philosophy changes (sharpened, added, retired, reworded).
  - Every draft waits for **Keep** or **Not yet**. Kept rules can be retired later.
- **Sidebar:**
  - Foundations rows show the slotted system and philosophy, and open the sheet.
  - The Learned rules count is live.
  - Memory health shows proposals waiting for review, or the latest kept rule.
- **Inspector · Always on:** pills for the slotted system and philosophy rev, plus the phase's rule count.
- **Rust:** `read_text_file` imports `.md`, `.json` and `.txt` only, up to 2 MB. In the browser preview, a file picker does the same.
- **Tests:** the markdown table parser, design-system and philosophy import, the token set for lint, prompt inclusion, versions and strength, drift detection and its thresholds, applying a proposal, Reflect's evidence gate and request, plus repo tests for foundation versions, proposals, rule lineages and scored runs. 120 in total.

### Fixed
- **Color drift only proposes changes to semantic tokens**, never a palette step like `sand-light/3`.

### Decisions
- **Andrew's skill files are imported at runtime and never committed.** This repo is public and those files are internal. The import fields default to their paths in `~/Documents/GitHub/slingshot-design-skills`.
- **Reflect needs 5 high and 5 low scored runs in a phase.** Below that, it proposes nothing on its own, because small samples overfit.
- **Principles imported from the designer's own writing start as "steady"**, labelled "from your writing", rather than "forming" with no decisions.
- **Verification:**
  - In the browser preview with the scripted model:
    - Both slots were imported from the real files, and Define runs carried them.
    - Ten scored Define runs led to Reflect, a kept rule and a sharpened principle.
    - Three builds with the same 10px radius led to a proposal. Accepting it produced Sundial v2.1.
    - Another proposal was rejected as "wrong idea".
    - The Build node showed soft staleness.
  - Not checked: Reflect with real Claude output.

## M8 · Share: the release video and the PR · 2026-11-04

### Added
- **Two Share recipes:**
  - `release_story` scripts a short video in four chapters, plus one voiceover line per chapter:
    - **The problem:** the most telling quote, verbatim, with who said it.
    - **The process:** one line over the real graph.
    - **The UI:** the prototype's beats, each tied to a hypothesis part.
    - **The proof:** each metric against its target.
  - `pr_description` writes the PR: summary, before → after, why (with the quote and the number), what to watch after merge, and how it was tested. It sits next to the story, so the PR can be rerun without re-scripting the video.
  - Both read every earlier locked output through project memory, and the charter forbids inventing numbers or quotes.
- **Share is scaffolded:** inlet `{verdict}` → Release story → Release story output, plus PR description. Locking the release story records "shipped".
- **`packages/renderer`**, a Remotion 4 project (1920×1080, 30 fps):
  - **Title card**, then the four chapters, then **"Shipped."**
  - **Problem:** the quote animates in word by word.
  - **Process:** the project's actual graph, every phase and loop, rebuilding in creation order. A camera follows each new node at a zoom where titles read, then pulls back to the whole graph. Phases become columns, and empty canvas is squeezed out.
  - **UI:** the locked prototype runs inside a device frame. A cursor taps the real `data-part` elements in order while each beat lights up beside it.
  - **Proof:** metrics count up to their values, with met or missed.
  - Burned-in captions, the canvas grid, corner brackets and a frame counter.
  - Each chapter stretches to fit its voiceover.
- **Rendering:**
  - `node render.ts` (Node's built-in type stripping) records the voiceover with macOS `say`, then bundles and renders **MP4** (H.264 + AAC), a **GIF** cut (half size, 10 fps) and a **poster** still from the proof chapter.
  - It prints JSON progress lines, which the app streams into a progress bar.
- **Inspector · Release story** (Figma 07 · Share):
  - The video plays in place through `@remotion/player`, with Open large.
  - The four chapters with their voiceover lines.
  - **Render MP4 + GIF**, then the poster, with Reveal in Finder for each file.
- **Inspector · PR description:**
  - The PR as reviewers will see it.
  - **Open pull request…** first says exactly what will happen (repo, branch, files), then pushes.
  - The PR is built in a temporary `git worktree` off the default branch: the prototype HTML, the GIF and the poster go under `design/composer/<slug>/`, in one commit. Then it's pushed and opened with `gh pr create`, with the GIF embedded in the body.
  - The designer's own checkout is never touched.
- **Rust commands:**
  - `story_render`, which runs the system Node and streams `story-progress` events.
  - `pr_open`, `reveal_path`, `open_url`, and `renderer_default_dir`.
  - Child processes get the login shell's `PATH`, so Node, git and gh are found even when the app is launched from the Finder.
- **Settings · Share:** the renderer folder (defaults to `packages/renderer` in this repo) and the repository for PRs.
- **Tests:** timeline lengths and voiceover stretching, process layout (fits the box, keeps creation order, skips empty phases), metric count-up, the story and PR contracts, and Share scaffolding. 103 in total.

### Decisions
- **The process chapter draws its own small nodes** rather than reusing the canvas components. Those depend on React Flow and the app's stores. These read the same data and use the same tokens.
- **The in-app player loads the prototype from its asset URL**, because Composer's CSP blocks inline scripts. Renders embed the HTML directly, so the cursor can find the real elements. In the player, the cursor falls back to scripted positions.
- **Voiceover uses macOS `say`.** No account, works offline. ElevenLabs can slot into `render.ts` later.
- **PRs go to a repository you choose in Settings.** Nothing is pushed until you confirm the plan.
- **Flag: Remotion's license.** It's free for individuals and companies of up to 3 people. Using it for Slingshot work needs a Remotion Company License. The renderer is one package behind a JSON-in, files-out interface, so it can be swapped.
- **Verification:**
  - The full Understand → Share flow ran in the browser preview with the scripted model, and the player plays the real project.
  - The app's actual story props were rendered end to end with `render.ts`: a 32 s MP4 with voiceover, a GIF and a poster. The frames were checked.
  - Not checked:
    - The Rust spawn and event stream inside the native window.
    - Opening a real PR. Nothing was pushed.

## M7 · Validate: test strategy, verdict, and the loop · 2026-11-04

### Added
- **Two Validate recipes:**
  - `test_strategy` names a success metric with its threshold, guardrails and a kill criterion. For each method (internal feedback in Slack, 360 testing, a Statsig A/B test, an unmoderated survey) it says whether to use it, the plan, and the exact questions to ask.
  - `verdict` reads the strategy and the evidence wired in. It returns holds, misses or inconclusive, what was observed for each metric and whether it was met, the findings, and what the next loop should look at.
- **Validate is scaffolded:** inlet `{prototype}` → Test strategy → Verdict → Verdict output. Evidence added while in Validate (Slack threads, session notes, Statsig results) wires straight into the Verdict.
- **Inspector · Test strategy** (Figma 07 · Validate):
  - Metric chips: success, guardrail and kill.
  - One row per method with Claude's plan and a badge that reflects real evidence: "4 replies" once a Slack thread is back, "N sessions" once notes are added, "results in" once Statsig is pulled.
  - Actions: **Post N questions to Slack** posts to the feedback channel and wires the thread in as evidence. **Add session notes** opens the Add menu. **Pull results** takes a Statsig experiment link.
- **Inspector · Verdict:** the verdict, each metric with observed value and ✓/✕, the findings, and the designer's call: **Metric holds → Share** or **↺ Misses → back to Understand**.
- **The loop:**
  - A miss locks the verdict, marks the hypotheses under test as failed with the result, and opens loop N+1 in Understand. The new loop gets a `{verdict}` inlet plus copies of every heavy or pinned source, and its own snapshot ("Loop 2 · back to Understand").
  - A hold marks them held. Share is scaffolded in M8.
  - Inconclusive asks for more evidence and stays in Validate.
  - Calling it differently from Claude is allowed. The override is stored on the locked version (`claude_said`) and logged as a decision.
- **Statsig connector:** an experiment link (Console API, `STATSIG-API-KEY`) becomes a data source. It finds the control and test groups, then pulls Pulse results: one line per primary and secondary metric with % change, confidence interval, p-value and sample sizes.
- **Settings:** a Slack feedback channel ID, stored as a project setting (not a secret).
- **Tests:** the strategy and verdict contracts, Statsig pulse parsing, and scaffolding: every name an instruction mentions is wired, including when a phase is scaffolded again in the next loop. 91 in total.

### Fixed
- **Template names are unique within a phase and loop**, not across the whole project. Previously, loop 2's strategy node became `strategy-2`, and the verdict's `{strategy}` stopped resolving.
- **Earlier loops are read-only for locking.** Locking an output from a previous loop now says so instead of writing a version.
- **Methods list in a stable order.** Object keys put "360" first because it looks like a number.

### Decisions
- **The holds and misses buttons sit under the verdict**, not under the strategy as drawn in the Figma 07 panel. The call is about the verdict, and the strategy exists before any evidence does.
- **Method switches show Claude's plan and aren't controls.** The strategy is an output, so changing which methods run means editing the instruction and rerunning.
- **Inspector type stays at the inspector scale** (12px body, 10px mono plans). The Figma panel is drawn 884px wide, at 13px.
- **Verification:**
  - The whole loop ran in the browser preview with the scripted model: Build lock → Validate scaffold → strategy → verdict → Misses → loop 2 → Understand through Validate again → Holds, with an override.
  - The Slack post path was only checked up to the missing-token message. Nothing was posted.

## M6 · Build: code prototypes and Figma · 2026-11-04

### Added
- **The `prototype` recipe** (Build → Prototype):
  - Claude returns one self-contained HTML document: inline CSS and JS, no network, no frameworks, framed at 390×844.
  - Each screen is marked with `data-screen`, and the elements carrying each part of the hypothesis with `data-part="who|behavior|because|metric"`.
  - Fidelity rules for low-fi (grayscale boxes), wireframe (real copy, neutral) and high-fi (design-system tokens as CSS variables, with states).
  - The result also carries screens, rationale and what it tests.
- **Build is scaffolded:** inlet `{statement}` → Prototype → Prototype output. Opening any empty phase whose predecessor is locked now lays out its spine from that lock.
- **Prototype runtime:**
  - A Rust `prototype_write` command writes the files under app data, with path-traversal checks.
  - The asset protocol is scoped to `$APPDATA/prototypes/**`, so prototypes load in a sandboxed iframe (`allow-scripts` only) outside Composer's origin and CSP. The browser preview uses blob URLs.
- **Inspector · Prototype** (Figma 07 · Build):
  - Fidelity cards: Low-fi, Wireframe, High-fi. Picking one changes what the next run builds.
  - The live prototype in a device frame, with Open large.
  - Screens, rationale, and Build in: Code prototype, Figma, On-system.
- **DOM → Figma:** a serializer is injected into every prototype. It walks the rendered DOM into a layer tree (flexbox becomes auto layout with gap and padding; text keeps size, weight, color and line height; layers are named by `data-screen` and `data-part`) and reports the colors, radii and font sizes used.
- **Companion Figma plugin** (`packages/figma-plugin`, plain JS, no network):
  - **Paste from Composer** builds the frames on a "Design Composer" page, with auto layout, fills, strokes, radii and fonts (falling back to Inter).
  - **Copy selection for Composer** exports a frame's PNG and text. Pasting that onto Composer's canvas makes a Figma source.
- **On-system lint** (`lintAgainstTokens`): the share of used colors, radii and sizes that match design-system tokens, with offenders ranked. It feeds the On-system figure and, in M9, design-system proposals.
- **Tests:** color normalization, lint scoring, and the prototype recipe contract. 84 in total.

### Decisions
- **Figma handoff goes through the clipboard** instead of a live WebSocket bridge. It needs no network permission in the plugin and no pairing, and it works offline. A live bridge can come later if paste feels slow in daily use.
- **Prototypes are single HTML documents.** React through a CDN would need network access inside the sandbox, so Claude writes vanilla HTML, CSS and JS.
- **Verification:**
  - The serializer was checked on a laid-out copy of a generated prototype: frames, auto-layout direction and gaps, text roles, used styles.
  - The inspector's own sandboxed frame couldn't be measured because the preview pane was hidden.
  - The Figma plugin was syntax-checked but hasn't been run inside Figma yet.

## M5 · History, playback and the memory chain · 2026-11-04

### Added
- **Swap a variable** (Figma 05):
  - ⇄ on a hypothesis variable opens candidates from the memory chain plus anything typed, ranked by how many sources back them.
  - While the popover is open, the blast radius is painted before anything runs: Claude nodes read "Would rerun after the swap", and outputs read "would need relock".
  - **Fork and rerun** snapshots the fork point, then creates the next block (H2) with the variable changed and the statement rewritten. It retires H1 (kept, never edited) and starts a new branch. The old line is marked retired, and every Claude node in the blast radius reruns.
- **Undo:** ⌘Z and ⇧⌘Z cover canvas edits, with a drag coalesced into one step. Undo never deletes runs or snapshots, and restored graphs keep their latest outputs, so the cache keys decide what's stale. ⌘Z right after a fork merges it back: the old branch and H1 become active again, and H2 is retired as "merged back".
- **Playback** (Figma 04):
  - ← and → step through the current branch's line from root to head. The canvas goes read-only, and the banner reads "PLAYBACK · Snapshot 9 of 22 · read-only" with Branch from here and Exit (esc).
  - Stepping forward rebuilds the frame node by node in creation order.
  - Play is paced by the real gaps between snapshots, capped at 1.5s. Speeds are 0.5×, 1× and 2×, Space plays at 2×, and Runs only skips everything but runs.
  - A filmstrip of snapshot thumbnails, with bookmark flags.
  - **Branch from here** starts a branch at the frame on screen. The old line is kept.
- **Timeline:**
  - Ticks open playback, and hovering one shows that snapshot's canvas thumbnail.
  - Branch curves are labelled with name and state ("H2 branch · merged back").
  - Bookmarks and Branches menus (switch branch), and Compare.
- **Bookmarks:** ⌘B drops a field at the playhead with a name suggested from the last snapshot or run. ⇧← and ⇧→ jump between bookmarks.
- **Compare** (Figma 04): any two snapshots on the line, each shown with its phase output, hypothesis and context, and a "What changed" list between them (swaps with the variable that changed, nodes added and wired, weights, reruns, inlet versions).
- **Memory:** clicking a hypothesis in the sidebar's Memory section places that chain block on the canvas, wired into the phase's Claude node.
- **Engine:** `swapVariable`, `nextLabel`, `evidenceFor`, `swapCandidates`, `repointHypothesis`, `playbackFrames`, `frameDelay`, `revealOrder`, `describeChanges`.
- **Data:** `Repo.switchBranch`.
- **Tests:** 80 in total.

### Decisions
- **Swap candidates:** in v1 they come from values other blocks in the chain have used, plus anything you type. Evidence is the number of source items that mention every content word. A Claude-suggested candidate list can come later, if typed swaps prove too manual.
- **The timeline and playback follow the current branch's lineage,** so branches never interleave. Other branches show as labelled curves at their fork point.
- **A locked draft can't be swapped:** ⇄ is enabled once a hypothesis is testing, held or failed. Drafts are edited directly.

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
