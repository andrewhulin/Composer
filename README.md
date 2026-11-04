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

**Status:** M1. The app shell matches Figma 01 · Workspace.

## Develop

Needs Node 26+, pnpm 11, Rust (stable, via rustup) and Xcode command line tools.

```bash
pnpm install
pnpm dev        # Tauri app with hot reload
pnpm web        # frontend only, in a browser at localhost:1420
pnpm check      # lint + typecheck + tests
```

API keys and connector tokens are stored in the macOS Keychain under `com.andrewhulin.composer`. They never go in the repo.
