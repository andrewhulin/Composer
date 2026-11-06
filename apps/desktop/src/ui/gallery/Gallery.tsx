import { useState, type ReactNode } from "react";
import * as Lucide from "lucide-react";
import { ArrowRight, Bookmark, GitBranch, Lock, Play, Plus, Search, Settings, Trash2 } from "lucide-react";
import { PHASES } from "@composer/core";
import {
  Badge,
  Button,
  Chip,
  ClaudeGlyph,
  Dot,
  Icon,
  IconButton,
  Input,
  Kbd,
  Logo,
  Menu,
  MenuDivider,
  MenuItem,
  Panel,
  PhaseHex,
  PhaseHexGlyph,
  Popover,
  Select,
  Tabs,
  Textarea,
  Toggle,
  Tooltip,
  type BadgeTone,
  type Brand,
  type ButtonVariant,
} from "../primitives";
import styles from "./Gallery.module.css";

// Every Lucide icon the app imports, found by reading the source, so this page never drifts from it.
const SOURCES = import.meta.glob("../**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const IN_USE = [
  ...new Set(
    Object.values(SOURCES).flatMap((src) =>
      [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)].flatMap((m) =>
        m[1]!
          .split(",")
          .map((s) => s.trim().replace(/^type\s+/, ""))
          .filter((s) => /^[A-Z]/.test(s) && s !== "LucideIcon"),
      ),
    ),
  ),
].sort();
const ICONS = Lucide as unknown as Record<string, Lucide.LucideIcon>;

const FONT_SIZES = ["micro", "meta", "small", "body", "slot", "phase", "title", "header", "display", "hero"];
const SPACING = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 128];
const RADII = ["2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "device", "pill"];
const COLORS: [string, string[]][] = [
  ["Surfaces", ["bg-app", "bg-canvas", "bg-panel", "bg-raised", "bg-hover", "bg-wash", "bg-wash-2", "bg-wash-3", "bg-wash-4", "bg-note"]],
  ["Borders", ["border-subtle", "border-strong", "border-wash"]],
  ["Text", ["text-primary", "text-soft", "text-secondary", "text-muted", "text-faint", "text-error", "text-inverse"]],
  ["Phases", PHASES.map((p) => `phase-${p}`)],
  ["Signals", ["signal-live", "signal-live-strong", "signal-hypothesis", "signal-warn", "signal-error", "signal-retired"]],
  ["Paper", ["paper-bg", "paper-bg-2", "paper-ink", "paper-ink-2", "paper-ink-muted", "paper-ink-deep"]],
];
const VARIANTS: ButtonVariant[] = ["primary", "phase", "secondary", "ghost", "tint", "danger"];
const TONES: BadgeTone[] = ["neutral", "muted", "live", "hypothesis", "warn", "error", "phase"];
const BRANDS: Brand[] = ["figma", "github", "linear", "pinterest", "notion", "anthropic", "claude", "slack", "statsig", "arena"];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <h2 className={styles.h2}>{title}</h2>
        {note && <p className={styles.note}>{note}</p>}
      </header>
      {children}
    </section>
  );
}

/** Dev-only: every token, icon and component state in one scroll. Open with ?gallery. */
export function Gallery() {
  const [tab, setTab] = useState("preview");
  const [weight, setWeight] = useState("normal");
  const [chips, setChips] = useState<string[]>(["Define"]);
  const [on, setOn] = useState(true);
  return (
    <div className={styles.page} data-phase="build">
      <header className={styles.top}>
        <span className={styles.pixel}>DC-1</span>
        <h1 className={styles.h1}>Composer UI</h1>
        <p className={styles.lede}>Tokens, icons and components. Hover, press and Tab through anything here to see its states; DESIGN_SYSTEM.md says when to use each.</p>
      </header>

      <Section title="Type" note="Geist and Geist Mono do the work. Serif is for verdicts and locked statements; Pixel for tiny labels.">
        <div className={styles.stack}>
          {FONT_SIZES.map((s) => (
            <div key={s} className={styles.typeRow}>
              <code className={styles.code}>--fs-{s}</code>
              <span style={{ fontSize: `var(--fs-${s})` }}>Recap after a session</span>
            </div>
          ))}
          <div className={styles.typeRow}>
            <code className={styles.code}>--font-mono</code>
            <span className={styles.mono}>snapshot 39 · 12.4k tokens · ⌘↵</span>
          </div>
          <div className={styles.typeRow}>
            <code className={styles.code}>--font-serif</code>
            <span className={styles.serif}>Returning users want the recap, not the session.</span>
          </div>
          <div className={styles.typeRow}>
            <code className={styles.code}>--font-pixel</code>
            <span className={styles.pixel}>H2 · LOOP 2 · NO SOURCES YET</span>
          </div>
        </div>
      </Section>

      <Section title="Color">
        {COLORS.map(([group, names]) => (
          <div key={group} className={styles.swatchGroup}>
            <h3 className={styles.h3}>{group}</h3>
            <div className={styles.swatches}>
              {names.map((n) => (
                <div key={n} className={styles.swatch}>
                  <span className={styles.chipColor} style={{ background: `var(--${n})` }} />
                  <code className={styles.code}>--{n}</code>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Spacing" note="Padding, margin and gap take only these, plus 0, 1px and auto.">
        <div className={styles.stack}>
          {SPACING.map((n) => (
            <div key={n} className={styles.typeRow}>
              <code className={styles.code}>--sp-{n}</code>
              <span className={styles.bar} style={{ width: `var(--sp-${n})` }} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radius, elevation and layers">
        <div className={styles.row}>
          {RADII.map((r) => (
            <div key={r} className={styles.swatch}>
              <span className={styles.radius} style={{ borderRadius: `var(--r-${r})` }} />
              <code className={styles.code}>--r-{r}</code>
            </div>
          ))}
        </div>
        <div className={styles.row}>
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={styles.swatch}>
              <span className={styles.elevated} style={{ boxShadow: `var(--shadow-${n})` }} />
              <code className={styles.code}>--shadow-{n}</code>
            </div>
          ))}
        </div>
        <p className={styles.note}>Layers, lowest to highest: popover 20 · bar 30 · sheet 40 · overlay 50 · palette 60 · toast 80 · fullscreen 95 · dialog 100 · tooltip 110 · coach 120.</p>
      </Section>

      <Section title={`Icons in use (${IN_USE.length})`} note="Lucide through <Icon>: 14, 16 and 20px, all with a 1.5px line.">
        <div className={styles.iconGrid}>
          {IN_USE.map((name) =>
            ICONS[name] ? (
              <div key={name} className={styles.iconCell} title={name}>
                <span className={styles.iconSizes}>
                  <Icon icon={ICONS[name]!} size="sm" />
                  <Icon icon={ICONS[name]!} size="md" />
                  <Icon icon={ICONS[name]!} size="lg" />
                </span>
                <code className={styles.code}>{name}</code>
              </div>
            ) : null,
          )}
          <div className={styles.iconCell}>
            <span className={styles.iconSizes}>
              <Icon icon={ClaudeGlyph} size="sm" />
              <Icon icon={ClaudeGlyph} size="md" />
              <Icon icon={ClaudeGlyph} size="lg" />
            </span>
            <code className={styles.code}>ClaudeGlyph</code>
          </div>
          <div className={styles.iconCell}>
            <span className={styles.iconSizes}>
              <Icon icon={PhaseHexGlyph} size="sm" style={{ color: "var(--phase-understand)" }} />
              <Icon icon={PhaseHexGlyph} size="md" style={{ color: "var(--phase-define)" }} />
              <Icon icon={PhaseHexGlyph} size="lg" style={{ color: "var(--phase-build)" }} />
            </span>
            <code className={styles.code}>PhaseHexGlyph</code>
          </div>
        </div>
        <div className={styles.row}>
          {PHASES.map((p) => (
            <span key={p} className={styles.inline}>
              <PhaseHex phase={p} /> {p}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Logos" note="Simple Icons, mono or in brand color. Slack, Statsig and Are.na fall back to a letter tile.">
        <div className={styles.row}>
          {BRANDS.map((b) => (
            <span key={b} className={styles.inline}>
              <Logo brand={b} size="lg" />
              <Logo brand={b} size="lg" tone="brand" />
              <code className={styles.code}>{b}</code>
            </span>
          ))}
        </div>
      </Section>

      <Section title="Button" note="One primary per surface. Phase fill for the main action inside a phase workspace.">
        {(["sm", "md", "lg"] as const).map((size) => (
          <div key={size} className={styles.row}>
            {VARIANTS.map((v) => (
              <Button key={v} variant={v} size={size}>
                {v[0]!.toUpperCase() + v.slice(1)}
              </Button>
            ))}
          </div>
        ))}
        <div className={styles.row}>
          <Button variant="primary" icon={Play} shortcut="⌘↵">
            Run node
          </Button>
          <Button variant="secondary" iconAfter={ArrowRight}>
            Send to Share
          </Button>
          <Button variant="ghost" icon={Plus}>
            Add source
          </Button>
          <Button variant="danger" icon={Trash2}>
            Delete node
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </div>
        <div className={styles.row}>
          <IconButton icon={Search} label="Search" shortcut="⌘K" />
          <IconButton icon={Bookmark} label="Bookmark" shortcut="⌘B" variant="secondary" />
          <IconButton icon={GitBranch} label="Branches" pressed />
          <IconButton icon={Settings} label="Settings" size="sm" />
          <IconButton icon={Lock} label="Locked" disabled />
        </div>
      </Section>

      <Section title="Fields">
        <div className={styles.grid2}>
          <Input placeholder="Name this project" />
          <Input size="sm" placeholder="Small" />
          <Input mono defaultValue="secret_••••••••" />
          <Input invalid defaultValue="Not a Notion link" />
          <Input disabled placeholder="Disabled" />
          <Select defaultValue="opus">
            <option value="opus">Claude Opus 5.5</option>
            <option value="sonnet">Claude Sonnet 5.5</option>
          </Select>
          <Textarea rows={3} placeholder="Why does this matter?" />
          <Textarea size="sm" rows={3} invalid defaultValue="Too short" />
        </div>
      </Section>

      <Section title="Chips and badges">
        <div className={styles.row}>
          {["Understand", "Define", "Build", "Validate", "Share"].map((a) => (
            <Chip key={a} selected={chips.includes(a)} onClick={() => setChips((c) => (c.includes(a) ? c.filter((x) => x !== a) : [...c, a]))}>
              {a}
            </Chip>
          ))}
          <Chip size="sm">Small</Chip>
          <Chip disabled>Disabled</Chip>
        </div>
        <div className={styles.row}>
          {TONES.map((t) => (
            <Badge key={t} tone={t}>
              {t}
            </Badge>
          ))}
          <Badge tone="neutral" mono>
            v3
          </Badge>
        </div>
      </Section>

      <Section title="Tabs and toggles">
        <div className={styles.stack}>
          <Tabs
            label="Inspector"
            value={tab}
            onChange={setTab}
            items={[
              { value: "preview", label: "Preview" },
              { value: "prompt", label: "Prompt", meta: "12k" },
              { value: "node", label: "Node" },
              { value: "off", label: "Disabled", disabled: true },
            ]}
          />
          <Tabs
            label="Weight"
            variant="segmented"
            value={weight}
            onChange={setWeight}
            items={["mute", "light", "normal", "heavy"].map((w) => ({ value: w, label: w[0]!.toUpperCase() + w.slice(1) }))}
          />
          <Tabs label="Small" variant="segmented" size="sm" value={weight} onChange={setWeight} items={["light", "normal", "heavy"].map((w) => ({ value: w, label: w }))} />
          <div className={styles.row}>
            <Toggle on={on} onChange={() => setOn(!on)} label="Live" />
            <Toggle on={!on} onChange={() => setOn(!on)} label="Off" />
            <Toggle on={on} onChange={() => setOn(!on)} size="md" tone="phase" label="Focus" />
            <Dot color="var(--signal-live)" />
            <Dot color="var(--signal-hypothesis)" size={8} />
            <Kbd>⌘K</Kbd>
            <Kbd boxed>⌘↵</Kbd>
            <Kbd boxed>⇧←</Kbd>
          </div>
        </div>
      </Section>

      <Section title="Surfaces">
        <div className={styles.grid3}>
          <Panel title="Context" actions={<Badge tone="live">12k / 200k</Badge>}>
            <p className={styles.body}>A quiet card for grouped content inside a panel.</p>
          </Panel>
          <Panel tone="raised" title="Weigh">
            <p className={styles.body}>A floating surface: popovers and docks.</p>
          </Panel>
          <Panel tone="paper" title="Release story">
            <p className={styles.serifInk}>The recap ships on Tuesday.</p>
          </Panel>
          <Popover>
            <Menu label="Node">
              <MenuItem icon={Play} shortcut="⌘↵">
                Run node
              </MenuItem>
              <MenuItem icon={GitBranch} hint="Rerun what it touches">
                Swap and fork
              </MenuItem>
              <MenuItem checked>Heavy</MenuItem>
              <MenuDivider />
              <MenuItem icon={Trash2} danger>
                Delete
              </MenuItem>
            </Menu>
          </Popover>
          <div className={styles.row}>
            <Tooltip label="Snapshot" shortcut="⌘B">
              <Button variant="secondary">Hover for a tooltip</Button>
            </Tooltip>
            <Tooltip label="Opens below" side="bottom">
              <Button variant="ghost">Below</Button>
            </Tooltip>
          </div>
        </div>
      </Section>
    </div>
  );
}
