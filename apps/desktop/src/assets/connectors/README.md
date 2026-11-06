# Connector setup guides

Each connector in Settings → Connectors has a numbered setup, with an animation beside each step. Drop files here and they take over from the coded stand-in. Rebuild the app (or restart `pnpm web`) and they're picked up. Nothing else to wire.

## Folders

One folder per connector, named by its id: `anthropic`, `linear`, `figma`, `arena`, `pinterest`, `slack`, `statsig`, `notion`, `github`.

## Options, best first

1. **`<id>/guide.riv`**: one Rive file for the whole setup.
2. **`<id>/step-<n>.gif`** (or `.webp`, `.png`, `.mp4`): one loop per step, numbered from 1. MP4s play muted and loop.
3. **Nothing:** Composer draws a coded mock of the screen, with a cursor moving to the thing to click.

You can mix 2 and 3: a step without its own file falls back to the coded mock.

## The Rive contract

| | |
|---|---|
| Artboard | the file's default artboard |
| State machine | `Guide` |
| Input | number `step`, 1-based, set by the stepper whenever the step changes |
| Size | drawn at 16:10 and scaled to fit; design at 800 × 500 |

Let each step's state loop on its own: show the screen, move a cursor to the exact control, press, and hold for a moment. Use Composer's tokens for anything that isn't the provider's own UI (see DESIGN_SYSTEM.md).

## Steps per connector

These match the stepper and the coded guides in `src/connections/registry.ts`. If you change the steps there, update this table.

| Connector | Steps | What each step shows |
|---|---|---|
| anthropic | 4 | 1 Console → API keys · 2 Create key · 3 Copy the key · 4 Paste in Composer |
| linear | 4 | 1 Settings → Security & access · 2 New personal API key · 3 Copy it · 4 Paste in Composer |
| figma | 4 | 1 Settings · 2 Security → Generate new token · 3 Scope: file content read · 4 Paste in Composer |
| arena | 3 | 1 Private channels only · 2 dev.are.na → New application · 3 Paste in Composer |
| pinterest | 3 | 1 Board is public · 2 Copy the board link · 3 Paste on the canvas |
| slack | 4 | 1 Create an app from scratch · 2 Add user token scopes · 3 Install and copy xoxp- token · 4 Paste in Composer |
| statsig | 3 | 1 Keys & Environments · 2 Generate a Console API key · 3 Paste in Composer |
| notion | 4 | 1 New internal integration · 2 Copy its secret · 3 Share the Dev queue with it · 4 Paste in Composer |
| github | 3 | 1 Install gh · 2 `gh auth login` · 3 Test in Composer |
