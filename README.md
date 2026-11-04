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

**Status:** M6. Build code prototypes at any fidelity and send them to Figma as editable frames (`packages/figma-plugin`). M5: every run is a snapshot: play the process back, branch, compare, and swap hypothesis variables (fork and rerun, ⌘Z merges back). M4: Collect from files, links, Linear, Figma, Are.na, Pinterest and Slack; weigh; synthesize; then draft and lock a testable statement in Define.

## Develop

Needs Node 26+, pnpm 11, Rust (stable, via rustup) and Xcode command line tools.

```bash
pnpm install
pnpm dev        # Tauri app with hot reload
pnpm web        # frontend only, in a browser at localhost:1420 (add ?fake for a scripted model)
pnpm check      # lint + typecheck + tests
```

API keys and connector tokens are stored in the macOS Keychain under `com.andrewhulin.composer`. They never go in the repo.
