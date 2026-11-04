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

**Status:** M0, architecture and plan.
