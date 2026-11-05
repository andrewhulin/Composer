# Composer

**Design Composer** is a Mac app that runs a product design process as a node graph, with Claude as the engine inside every node.

**Five phases:** Understand → Define → Build → Validate loop until the hypothesis holds. Share is the only way out.

- [ARCHITECTURE.md](ARCHITECTURE.md): how it works
- [PLAN.md](PLAN.md): milestones
- [CHANGELOG.md](CHANGELOG.md): what changed and why

**Stack:**
- Tauri 2, React 19, TypeScript, React Flow, Zustand
- SQLite (rusqlite)
- Anthropic TypeScript SDK, Claude Opus 5.5

**Status:** v1 (M10). Search with ⌘K, see every shortcut with ?, and add canvas comments with C. Packaged as a Mac app. M9: Foundations: your design system and philosophy ride along in every prompt. Drift in your overrides becomes design-system proposals. Scored runs teach Composer craft rules, and nothing applies until you keep it. M8: Share renders a release video of the real process (Remotion: problem, process, prototype, proof, with voiceover) and opens the PR. M7: Validate against a test strategy (Slack feedback, 360 sessions, Statsig results), call the verdict, and loop back to Understand on a miss. M6: Build code prototypes at any fidelity and send them to Figma as editable frames (`packages/figma-plugin`). M5: every run is a snapshot: play the process back, branch, compare, and swap hypothesis variables (fork and rerun, ⌘Z merges back). M4: Collect from files, links, Linear, Figma, Are.na, Pinterest and Slack; weigh; synthesize; then draft and lock a testable statement in Define.

## Develop

Needs Node 26+, pnpm 11, Rust (stable, via rustup) and Xcode command line tools.

```bash
pnpm install
pnpm dev        # Tauri app with hot reload
pnpm web        # frontend only, in a browser at localhost:1420 (add ?fake for a scripted model)
pnpm check      # lint + typecheck + tests
pnpm tauri build   # in apps/desktop: Design Composer.app
```

The built app is at `apps/desktop/src-tauri/target/release/bundle/macos/Design Composer.app`. It isn't signed, so the first time, right-click it and choose Open.

Rendering the release video uses `packages/renderer` with the system Node. The first render downloads Chrome Headless Shell. To render outside the app:

```bash
cd packages/renderer && node render.ts --props story.json --out ./out
```

**Remotion license:** free for individuals and companies of up to 3 people. Company use beyond that needs a [Remotion Company License](https://www.remotion.dev/license).

API keys and connector tokens are stored in the macOS Keychain under `com.andrewhulin.composer`. They never go in the repo.
