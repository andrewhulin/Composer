# Changelog

Newest first. Every milestone adds an entry. A **Decisions** list records each default picked without asking, so it can be revisited.

## Home: pick or start a project (DC-2) · 2026-11-06

### Added
- **Home** opens at launch.
  - **Cards:** every project as a card, most recently edited first. Each card shows the active phase in its color, the loop, when it was last edited, and a short project id in Geist Pixel.
  - **Covers:** the newest prototype, live and scaled. Otherwise the newest locked output on paper, with statements and verdicts in Serif. Otherwise "Nothing locked yet".
  - **New project** (⌘N): name it inline and it drops straight into Understand. Leaving the name empty makes "Untitled problem".
  - **Card menu:** Rename (or double-click the name), Duplicate, Archive. Archived projects sit under "Archived" on Home, and Restore brings them back. Nothing is deleted.
  - **Search** appears once there are more than eight projects.
- **Home is one keystroke away:**
  - ⇧⌘H from anywhere.
  - Clicking the project name in the title bar (double-click still renames).
  - ⌘K → Go home or Switch project, and every project is listed in the palette.
  - On Home, Esc goes back to the open project.
- **Composer remembers the last project** and has it loaded behind Home at launch, so returning to it is instant.
- **Duplicate** copies a project's current state:
  - **What comes along:** the graph, locked outputs, hypotheses, latest runs and canvas comments, each with fresh ids.
  - **What stays with the original:** history, bookmarks, decisions and eval evidence, so scores aren't counted twice. The copy's history starts at "Duplicated from …".
  - **Freshness:** nodes that were fresh stay fresh. The engine's `carryFreshness` recomputes their keys after the id swap.
- **Tests (250 in total):**
  - archive, restore, duplicate and covers in the data layer
  - fresh nodes staying fresh
  - switching in the store: no selection, undo, run or UI state carries across, and an edit made just before switching is saved
  - comments staying with their project
  - Home's actions and the card covers

### Changed
- **Migration 3** adds `project.archived_at`. `listProjects` leaves archived projects out unless asked.
- **Switching projects** saves any pending autosave first, stops the old project's runs (with a toast saying how many), and closes playback. It also clears undo, stream buffers and the studio, variants and compare views.

### Fixed
- **A canvas comment edited just before a switch** could have been saved under the next project. Comment saves now stay with the project they were scheduled in, and are flushed before switching.

### Decisions
- **Launch shows Home with the last project already loaded.** "Back to the open project" (Esc) costs nothing, and a fresh project costs nothing either.
- **Covers prefer a prototype** (locked or not, the newest Build run) because it's the most recognizable thing a project makes. Without one, the newest locked output's headline is shown.
- **Duplicates don't open automatically.** They land first on Home, so you can rename them before starting.
- **Archiving the open project closes it.** Home then offers no "back" until another project opens.
- **Renaming counts as an edit,** so a renamed project moves to the front. Archiving and restoring don't.

## Composer's own design system (DC-1) · 2026-11-06

### Added
- **A codified UI system:** tokens, shared components, icons and the rules that keep them in use, written up in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). CLAUDE.md points every session at it. It is the app's own system, separate from the Foundations design system Composer feeds into prompts.
- **15px body type** on a fixed scale: 11, 12, 13, 15, 16, 18, 20, 24, 28 and 40. The half-pixel steps are gone, and no UI text is under 11px.
- **New tokens:**
  - spacing, from `--sp-2` to `--sp-128`
  - control heights and icon sizes
  - four shadows and named layers
  - focus ring and states
  - color channels for alpha, so `rgba(var(--rgb-ink), 0.06)` replaces raw numbers
- **Geist Serif and Geist Pixel,** bundled from the `geist` package (OFL), so they load with no network.
  - **Serif** sets the statement on paper in Define and the verdict word in Validate.
  - **Pixel** sets the phase numbers on the rail, the KEY marker on key nodes and the empty-canvas kicker.
- **Shared components** in `ui/primitives`: Button, IconButton, Input, Textarea, Select, Chip, Badge, Tabs (underline and segmented), Panel, Popover, Menu, Tooltip, Kbd, Icon and Logo. Each has hover, keyboard focus, pressed and disabled states.
- **Lucide icons** through `<Icon>`, at 14, 16 or 20px, always with a 1.5px line.
  - Composer's phase hexagon and Claude glyph are redrawn on Lucide's grid.
  - The 13 SVG icons exported from Figma are gone.
  - Text characters that stood in for icons became icons: close crosses, ticks, chevrons, swap arrows, the cache diamond.
- **Connector logos** come from Simple Icons (CC0) through `<Logo>`, for the Settings redesign (DC-3).
- **A gallery** at `localhost:1420/?gallery`, in dev builds only. It shows every token, every Lucide icon the app imports (read from the source, so it can't drift) and every component state.
- **Lint enforcement:**
  - stylelint, now part of `pnpm lint`, rejects raw colors and off-scale type and spacing outside `tokens.css`.
  - ESLint rejects color literals and inline `<svg>` icons in `ui/`.

### Changed
- **The whole UI scaled for the larger type.**
  - Spacing grew by about 1.25× and snaps to the scale. Sizes, line heights and node cards grew by 1.25×.
  - About 190 hand-styled buttons, plus the fields, tabs, chips, menus and kbd hints, now use the shared components, and their duplicate CSS is gone.
  - All 47 CSS modules and the inline colors in the canvas and history now use tokens.
- **Saved graphs are untouched.** The canvas draws stored node positions 1.25× apart (`CANVAS_SCALE`) and divides on the way back, so the larger nodes keep their gaps.
- **Layout:**
  - Title bar 48, phase rail 64, sidebar 272, inspector 368, history 176, key node dock 344.
  - Under 1600px wide (14" screens), the sidebar, inspector and dock step back down to 248, 336 and 312.
- **Positioning fixes:**
  - The Scorecard/Graph toggle now sits at the workspace's right edge instead of the canvas center, so it can't slide under the key node dock.
  - The phase rail shows "Loop N" and keeps the loop explanation for wide windows and its tooltip.
  - The prototype studio fits the phone to the studio's height instead of guessing from the window.
- **Native controls** (scrollbars, selects, the color picker) draw dark (`color-scheme: dark`).
- **Choose files…** in the Foundations sheet is now a real button, so it takes keyboard focus.

### Decisions
- **Scale the layout with the type, then step down on small screens.** At 1728 everything is about 1.25× the Figma frames. Under 1600 the side panels go back to their old widths, so Define and Validate keep the room they had.
- **Define stacks its evidence rail under the statement** at 1728 with both side panels open. The two columns come back with the sidebar hidden (⌥⌘←) or on a wider screen.
- **Spacing snaps up when it ties** (4px became 6, 12 became 16), since the brief asked for room rather than crowding.
- **Serif covers the whole statement on paper,** while editing too, not only after locking, so the hero doesn't change typeface mid-task.
- **Keyboard symbols stay text.** ⌘ ⌥ ⇧ ↵ sit inside `<Kbd>`. Arrows between two words of copy ("Holds → Share") stay text too, and a lone arrow, tick or cross on a control became an icon.
- **Selected segments take the phase tint** inside a phase, and a neutral lift elsewhere.
- **The type specimens** in Foundations show at least 11px, even when a design system's caption is 10.
- **Slack, Statsig and Are.na** show a letter tile until their official marks are added, since Simple Icons doesn't carry them.
- **Prettier stays unenforced,** as before. Only lint, typecheck and tests gate commits.

## Share: transitions, a real proof chart, reference pacing and a delivery check · 2026-11-05

### Added
- **Transitions between chapters** (`@remotion/transitions`): fade, slide, wipe or a hard cut, chosen by the story. Neighbouring chapters overlap for half a second, so the video runs a little shorter and never pauses on black.
- **Motion blur on the UI chapter's cursor** (`@remotion/motion-blur`): the arrow leaves a short trail while it moves, and only the arrow, so the prototype isn't re-rendered.
- **A real chart in the Proof chapter** (D3 scales and number formats): each metric's observed change as a dot, its confidence range as a bar, and a dashed target line, on one axis per unit so metrics measured the same way compare at a glance. Stories without numbers keep the big-number cards.
- **Match a reference video** (in the Share view): pick any MP4, MOV, WebM or GIF, and Remotion's own ffmpeg reads where its shots change and pulls up to ten stills. It lands as a Share source wired into the release story. Claude reads the rhythm in words and sees the stills, then sets the transition and seconds per chapter to match on the next run.
- **Every render is checked with ffprobe:** size, frame rate, length against the timeline, and whether the voiceover made it in. The Share view shows "Checked with ffprobe · 1920×1080 · 30 fps · 29.6 s · H.264 + AAC · 7.1 MB", or what's off.
- **Tests:** transitions and pacing in the timeline, the chart scales and number formats, the ffprobe check, cut finding and still picking, the reference as a source, and the story schema. 233 in total.

### Changed
- **The release story schema** asks for `motion` (transition and pacing, pacing null when there's no reference) and, per metric, `chart` (numbers, each null rather than guessed).
- **The reference reader** (`reference.ts`) lives next to `render.ts` in `packages/renderer` and runs through the same Node.
- **Tauri's dialog plugin** is added for the video picker (open only).

### Decisions
- **Half-second transitions, fade by default.** Old stories with no `motion` play with fades at the old pacing.
- **Paced seconds are kept between 1.5 and 15 per segment,** and a chapter still stretches to fit its voiceover and content.
- **Cuts are found in code, not by ffmpeg.** Remotion's ffmpeg build has no scene, select or fps filter. Frames are sampled at 10 per second as 64×36 grayscale; a cut is the largest change within 0.2 s that's at least 2% and three times the typical change in the surrounding 1.5 s, so a slide counts once and a scrolling recording counts never.
- **Stills go inline** as JPEG data URLs, so the app needs no file access to show or send them, and only the first three minutes of a reference are read.
- **Zero reads "0%", not "+0%".**

## Feature requests to the Dev queue · 2026-11-05

### Added
- **⌘K → Request a feature:** a short form that adds a row to the Dev queue database in Notion.
  - **Fields:** what Composer should do, why and how you'd use it, and the area. The area is pre-filled from the phase you're in.
  - **"Include where I am"** adds the phase, the loop, the kind of step selected and the app version. It never includes the project's content, and the form shows exactly what goes.
  - **Every row lands as Proposed, with Source "In-app",** so nothing builds it until it's moved to Queued by hand.
  - **Nothing is lost offline:** a request is saved first, then sent. One sent before Notion is connected, or when Notion can't be reached, waits and goes at the next launch, when Settings change, or with the next request.
- **Settings → Feature requests:** the Notion integration token (in Keychain), the database link, and what's waiting, with Send now.
- **The browser preview** scripts Notion with `?notion=ok` or `?notion=error`, since Notion blocks requests from a browser.
- **Tests:** link parsing, the row's properties, the data source lookup and Notion's errors, and the outbox (order, retries, overlapping sends, the cached lookup). 211 in total.

### Changed
- **The work queue moved from `queue.md` to Notion.** CLAUDE.md now points every session at the Dev queue: cloud sessions add Proposed rows, and local sessions build only Queued ones.
- **The Dev queue database** gained a Proposed status before Queued, a Declined status, and a Source field (Andrew, Cloud agent or In-app).

### Fixed
- **Esc closes Settings from any field.** The token, channel and folder fields swallowed every key, so Esc did nothing while one was focused.

### Decisions
- **Notion API 2025-09-03:** rows are created under the database's data source. It's looked up from the database link once, then cached.
- **The database link isn't built in.** The repo is public and other people may run Composer, so each copy is pointed at its own queue in Settings.
- **Rows typed straight into Notion still default to Queued,** because adding one yourself is the approval.

## In-app updates · 2026-11-05

### Added
- **Composer updates itself from GitHub Releases:**
  - **Checks quietly** 5 seconds after launch, then every four hours. A check that fails stays silent; Settings says why.
  - **Title-bar pill:** "Update ready · v0.1.1 · Restart". Clicking it downloads the signed update, installs it and relaunches, with progress in the pill.
  - **Never cuts off work:** if a Claude run, Reflect, a replay or a video render is in flight, the pill shows "Waiting" and Composer restarts when it finishes. Click the pill to cancel; the download is kept.
  - **⌘K → Check for updates.** Once an update is found it becomes "Restart to update to v0.1.1".
  - **Settings → Updates:** the running version, when it last checked, and any error, with Check for updates, Restart to update, or Don't restart yet.
  - Pending edits are saved before the relaunch.
- **Release workflow** (`.github/workflows/release.yml`): pushing a `v*` tag checks that the tag matches the app version, runs `pnpm check`, builds one universal app (Apple Silicon and Intel), signs the update and publishes a GitHub Release with the `.app.tar.gz`, its `.sig` and `latest.json`.
- **README:** how to cut a release, the one-time signing secrets, and how to install from a release.
- **Browser preview:** updating is a no-op without Tauri. `?update=0.1.1` scripts a found update; `?update=latest`, `?update=error` and `&install=error` script the other outcomes.
- **Tests:**
  - **The update lifecycle:** quiet and manual checks, the launch delay and interval, waiting for a run, a run starting during the save, cancel, a double-clicked Restart, and retrying a failed download, install or relaunch.
  - **Against the real stores:** a restart waits for a Claude run, Reflect, a replay or a video render, and saves the working graph first. Also the ⌘K entry, and that a development copy never checks on its own.
  - **The updater:** download progress from the Tauri plugin, and each scripted outcome in the browser preview.
  - 192 in total.

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

## Work queue · 2026-11-05

### Added
- **CLAUDE.md** with the house rules for every Claude session in this repo. Cloud sessions add work to `queue.md` instead of changing code on GitHub. Local sessions read `queue.md` first, and Andrew picks what gets done.

### Decisions
- **Queue items are proposals, not instructions.** A local session lists them with its take, and does only what Andrew picks.
- **A shipped item is marked done in `queue.md` in the same commit**, with its hash.

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
