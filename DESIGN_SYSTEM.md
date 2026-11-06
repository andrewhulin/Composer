# Composer's UI design system

This is the system for **Composer's own interface**: the window, canvas, panels and sheets. It is separate from the Foundations design system (`DesignSystemVersion`), which Composer feeds into prompts for the products it designs.

- **Tokens:** [`apps/desktop/src/styles/tokens.css`](apps/desktop/src/styles/tokens.css). It is the only stylesheet allowed raw colors and sizes.
- **Components:** [`apps/desktop/src/ui/primitives`](apps/desktop/src/ui/primitives), imported from its `index.ts`.
- **Gallery:** run the web preview and open `localhost:1420/?gallery` to see every token, every icon in use, and every component state. It exists in dev builds only.
- **Lint:** `pnpm lint` runs ESLint and stylelint. Both fail on raw colors and on off-scale type or spacing.

## Principles

1. **Quiet chrome, loud content.** The surfaces are near-black and the type is warm off-white. Color is kept for meaning: the five phase colors, the live green, the hypothesis yellow, and red for errors. If something is colored, it's saying something.
2. **One scale for everything.** Type, spacing, radius, control height and icon size each come from a short scale. If a value isn't on its scale, the design is wrong, not the scale.
3. **Dense, not cramped.** Body text is 15px. Rows and controls are sized so that 15px fits with room to breathe, while panels stay narrow enough to leave the canvas the space.
4. **Mono for machine facts.** Ids, counts, tokens, versions, timestamps and section labels use Geist Mono. Everything people read uses Geist.
5. **Accents are rare.** Geist Serif and Geist Pixel each have a few named uses (below). Reaching for them anywhere else dilutes them.
6. **Every control has every state.** Each control has hover, keyboard focus (`--focus-ring`), pressed and disabled states. Focus shows only for keyboard use (`:focus-visible`).

## Tokens

### Color

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `--bg-app`, `--bg-canvas`, `--bg-panel`, `--bg-raised`, `--bg-hover`, `--bg-wash` … `--bg-wash-4` | From the window back to the front. Washes are tints of ink for cards inside panels. |
| Borders | `--border-subtle`, `--border-strong`, `--border-wash` | Subtle between regions, strong around controls. |
| Text | `--text-primary`, `--text-soft`, `--text-secondary`, `--text-muted`, `--text-faint`, `--text-inverse`, `--text-error` | Primary for what people read, secondary for supporting text, muted for labels and metadata. |
| Phases | `--phase-understand` `--phase-define` `--phase-build` `--phase-validate` `--phase-share` | Set `data-phase` on a container to get `--phase` and `--phase-rgb` for it. |
| Signals | `--signal-live`, `--signal-hypothesis`, `--signal-warn`, `--signal-error`, `--signal-retired` | Status only. |
| Paper | `--paper-*` | Rendered output (statements, release stories) shown as paper. |
| Channels | `--rgb-ink`, `--rgb-black`, `--rgb-<phase>`, `--rgb-live`, `--rgb-hypothesis` … | For alpha: `rgba(var(--rgb-ink), 0.06)`. Never write the numbers out. |

### Type

| Token | Size | Use |
|---|---|---|
| `--fs-micro` | 11 | The smallest text allowed: mono metadata, badges, ruler labels |
| `--fs-meta` | 12 | Caps section labels, kbd hints, timestamps |
| `--fs-small` | 13 | Secondary text, chips, small buttons, notes |
| `--fs-body` | 15 | Default for body text, buttons and fields |
| `--fs-slot` | 16 | Emphasized body: card titles, large buttons |
| `--fs-phase` | 18 | Phase names, sheet titles |
| `--fs-title` | 20 | Statements on nodes, panel heroes |
| `--fs-header` | 24 | Workspace headers |
| `--fs-display` | 28 | Large display text |
| `--fs-hero` | 40 | Big numbers |

Families are `--font-sans` (Geist), `--font-mono` (Geist Mono), `--font-serif` (Geist Serif) and `--font-pixel` (Geist Pixel), all bundled under `assets/fonts` with no network. Serif and Pixel each have one weight. Their `ELSH` axis picks the alternate shapes, and 0 is the regular cut.

**Accent fonts, allowed uses only:**
- **Geist Serif:** the statement on paper in the Define workspace, and the verdict word in Validate. These are the two moments where Composer states a conclusion.
- **Geist Pixel:** tiny accent labels: the phase numbers on the rail, the KEY marker on key nodes, step numbers in setup guides, and empty-state kickers. Use `--fs-meta` or smaller, in caps.

### Spacing

`--sp-2`, `--sp-4`, `--sp-6`, `--sp-8`, `--sp-10`, `--sp-12`, `--sp-14`, `--sp-16`, `--sp-18`, `--sp-20`, `--sp-24`, `--sp-28`, `--sp-32`, `--sp-40`, `--sp-48`, `--sp-56`, `--sp-64`, `--sp-80`, `--sp-96`, `--sp-128`. Each is named by its pixel value.

- `padding`, `margin` and `gap` take only these, plus `0`, `1px`, `auto`, percentages, viewport units, or a `calc()` of tokens.
- Typical gaps:
  - icon to its label: 6–8
  - between rows: 2–6
  - inside cards: 12–16
  - between sections: 24–32
  - around a workspace: 64–96

### Shape, depth and layers

- **Radius:** `--r-2xs` 2, `--r-xs` 4, `--r-sm` 6, `--r-md` 8, `--r-lg` 10, `--r-xl` 12, `--r-2xl` 16, `--r-3xl` 20, `--r-device` 24, `--r-pill`. Controls use `md`, cards use `lg`, and sheets use `xl`.
- **Shadows:**
  - `--shadow-1`: menus, popovers, tooltips
  - `--shadow-2`: floating panels
  - `--shadow-3`: sheets, dialogs, the palette
  - `--shadow-4`: full-window overlays
- **Layers:**
  - Lowest to highest: `--z-popover` 20, `--z-bar` 30, `--z-sheet` 40, `--z-overlay` 50, `--z-palette` 60, `--z-toast` 80, `--z-fullscreen` 95, `--z-dialog` 100, `--z-tooltip` 110, `--z-coach` 120.
  - Inside a component, small local numbers (1–9) are fine.
- **Controls:** heights `--control-xs` 22, `--control-sm` 26, `--control-md` 32, `--control-lg` 40.
- **States:** `--focus-ring`, `--state-hover`, `--state-selected`, `--state-disabled-opacity` 0.4, `--state-press-scale` 0.98.
- **Motion:** `--t-fast` 120ms for hover and press, and `--t-settle` 180ms on `--ease-out` for anything that moves into place.

### Layout

| Token | Value | Use |
|---|---|---|
| `--titlebar-h` | 48 | Title bar height |
| `--rail-h` | 64 | Phase rail height |
| `--sidebar-w` | 272 | Sidebar width |
| `--inspector-w` | 368 | Inspector width |
| `--history-h` | 176 | History bar height |
| `--keynode-w` | 344 | Key node dock width |
| `--grid` | 35 | Canvas grid |
| `--traffic-lights` | 68 | Clearance for the macOS window buttons; it doesn't scale |

Under 1600px wide (14" screens), the sidebar, inspector and key node dock step down to 248, 336 and 312, so the workspaces keep their room.

The canvas draws stored node positions 1.25× apart (`CANVAS_SCALE` in `FlowCanvas.tsx`), so the larger nodes keep their gaps. Saved graphs never change.

## Icons

- **Library:** [Lucide](https://lucide.dev) (`lucide-react`, ISC license), always through `<Icon icon={Name} size="sm|md|lg" />`. Never import an SVG file or draw an inline `<svg>` for an icon. ESLint blocks `<svg>` in `ui/`, except data graphics that carry a disable comment saying so.
- **Sizes:** `sm` 14px in dense rows and inside small buttons, `md` 16px beside body text, `lg` 20px in toolbars.
- **Line weight:** the line is `--icon-stroke` (1.5px) at every size, because the stroke doesn't scale.
- **Color:** icons take `currentColor`. Give them a softer color than the text beside them (secondary or muted), so they don't outweigh it.
- **Composer's own glyphs** live in `ui/primitives/glyphs.ts`. They're drawn on Lucide's 24px grid with `createLucideIcon`, so they behave like any other icon:
  - `PhaseHexGlyph`: filled, colored by phase
  - `ClaudeGlyph`: six spokes
- **Text, not icons:** keyboard symbols (⌘ ⌥ ⇧ ↵) stay as text inside `<Kbd>`. An arrow between two words of copy also stays text ("Holds → Share"). A lone arrow, tick or cross on a control becomes an icon.
- **Logos:** `<Logo brand="figma" />` draws company marks from Simple Icons (CC0), in mono or brand color. Slack, Statsig and Are.na aren't in Simple Icons and show a letter tile until official marks are added.

## Components

| Component | Use | Variants |
|---|---|---|
| `Button` | Any text action | `primary` (one per surface), `phase` (main action inside a phase workspace), `secondary`, `ghost`, `tint`, `danger`; sizes `sm`/`md`/`lg`; `icon`, `iconAfter`, `shortcut`, `block` |
| `IconButton` | Icon-only actions. The `label` is required and shows as the tooltip | `ghost`, `secondary`; `sm`/`md`; `pressed` for toggles |
| `Input`, `Textarea`, `Select` | Form fields. Select is native, for the macOS menu | `sm`/`md`, `invalid`, `mono` |
| `Chip` | A pill that toggles: filters and pickers | `selected`, `sm`/`md` |
| `Badge` | Static status or count | `neutral`, `muted`, `live`, `hypothesis`, `warn`, `error`, `phase`; `mono` |
| `Tabs` | `underline` switches a panel's view; `segmented` picks one option | `sm`/`md`, `block` |
| `Panel` | Groups content | `card` (in panels), `raised` (floating), `paper` (rendered output) |
| `Popover`, `Menu`, `MenuItem` | Floating surfaces and action lists. Popover closes on Esc or a click outside; Menu moves with the arrow keys | `MenuItem`: `icon`, `hint`, `shortcut`, `checked`, `danger` |
| `Tooltip` | A short hint on hover or keyboard focus, drawn above everything | `top`/`bottom`, `shortcut` |
| `Kbd` | Shortcut text | `boxed` |
| `Icon`, `Logo`, `PhaseHex`, `Toggle`, `Dot` | As described above | |

**Bespoke controls** stay bespoke, but use tokens and have a `:focus-visible` style. These are node cards and ports, timeline ticks and the playhead, the verdict Holds and Misses buttons, canvas frames, and whole-row clickable cards. A pattern that repeats three times becomes a primitive.

## Adding to the system

1. Check the gallery for something that already does the job.
2. If you need a new value, add a token to `tokens.css` with a comment saying what it's for, and list it here.
3. A new component goes in `ui/primitives`, gets exported from `index.ts`, and gets a section in the gallery that shows every state.
4. `pnpm lint` must pass. The lint rules are the system's enforcement, so don't loosen them to get past a violation.
