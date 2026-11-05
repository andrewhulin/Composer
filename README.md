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

**Status:** v1 (M10), plus a first-run guide that walks you through setup and your first loop. Reopen it from ⌘K → Tutorial. Search with ⌘K, see every shortcut with ?, and add canvas comments with C. Packaged as a Mac app. M9: Foundations: your design system and philosophy ride along in every prompt. Drift in your overrides becomes design-system proposals. Scored runs teach Composer craft rules, and nothing applies until you keep it. M8: Share renders a release video of the real process (Remotion: problem, process, prototype, proof, with voiceover) and opens the PR. M7: Validate against a test strategy (Slack feedback, 360 sessions, Statsig results), call the verdict, and loop back to Understand on a miss. M6: Build code prototypes at any fidelity and send them to Figma as editable frames (`packages/figma-plugin`). M5: every run is a snapshot: play the process back, branch, compare, and swap hypothesis variables (fork and rerun, ⌘Z merges back). M4: Collect from files, links, Linear, Figma, Are.na, Pinterest and Slack; weigh; synthesize; then draft and lock a testable statement in Define.

## Develop

Needs Node 26+, pnpm 11, Rust (stable, via rustup) and Xcode command line tools.

```bash
pnpm install
pnpm dev        # Tauri app with hot reload
pnpm web        # frontend only, in a browser at localhost:1420 (add ?fake for a scripted model)
pnpm check      # lint + typecheck + tests
pnpm tauri build   # in apps/desktop: Design Composer.app
```

The built app is at `apps/desktop/src-tauri/target/release/bundle/macos/Design Composer.app`. It's ad-hoc signed, not notarized.

Rendering the release video uses `packages/renderer` with the system Node. The first render downloads Chrome Headless Shell. To render outside the app:

```bash
cd packages/renderer && node render.ts --props story.json --out ./out
```

**Remotion license:** free for individuals and companies of up to 3 people. Company use beyond that needs a [Remotion Company License](https://www.remotion.dev/license).

API keys and connector tokens are stored in the macOS Keychain under `com.andrewhulin.composer`. They never go in the repo.

## Release

Installed copies update themselves from GitHub Releases. They check a few seconds after launch and every four hours; ⌘K → Check for updates checks now. An update shows as a pill in the title bar, and restarting waits for any running Claude call.

**Cut a release:**

1. Bump `version` in `apps/desktop/src-tauri/tauri.conf.json` (say to `0.1.1`), add a CHANGELOG entry, and merge to `main`.
2. Tag that commit and push the tag:

   ```bash
   git tag v0.1.1
   ```

   ```bash
   git push origin v0.1.1
   ```

3. The Release workflow checks the tag matches the version, runs `pnpm check`, builds a universal app, signs the update and publishes the release with `latest.json`. Follow it under Actions.

**One-time setup:** updates are signed with a key that stays out of the repo, at `~/.tauri/composer-updater.key`, with its password in Keychain (`composer-updater-signing`). Add both as repository secrets:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo andrewhulin/Composer < ~/.tauri/composer-updater.key
```

```bash
security find-generic-password -s composer-updater-signing -a TAURI_SIGNING_PRIVATE_KEY_PASSWORD -w | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo andrewhulin/Composer
```

Back up the key and password somewhere safe. Installed copies only accept updates signed with this key; if it's lost, each Mac needs a manual reinstall.

**Install from a release:** the app isn't notarized. Downloaded with the GitHub CLI, macOS doesn't quarantine it, so it opens straight away:

```bash
gh release download --repo andrewhulin/Composer --pattern '*.app.tar.gz' --dir ~/Downloads/composer-release
```

```bash
tar -xzf ~/Downloads/composer-release/*.app.tar.gz -C /Applications
```

Downloaded in a browser instead, move it to Applications, open it once, then go to System Settings → Privacy & Security and click **Open Anyway** (on macOS 14 and earlier, right-click the app and choose Open). Updates then install in place. After each update macOS may ask once whether Design Composer can use its Keychain items: choose Always Allow.
