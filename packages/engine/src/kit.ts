/**
 * The prebaked interaction kit. Claude wires these attributes together instead of writing logic;
 * the desktop app injects the runtime that makes them work. Keeping the vocabulary here means the
 * prompt, the fake model and the runtime agree on one contract.
 */

export const KIT_ATTRIBUTES = [
  "data-screen",
  "data-go",
  "data-transition",
  "data-back",
  "data-sheet",
  "data-sheet-id",
  "data-close",
  "data-toggle",
  "data-tab",
  "data-panel",
  "data-toast",
  "data-repeat",
  "data-limit",
  "data-sample",
] as const;

/** What the prompt tells Claude about the kit. */
export const KIT_DOC = `Interaction kit (already loaded in the prototype, do not reimplement it, write no navigation or state logic of your own):
- Screens: every top-level screen is <section data-screen="Name">. The first one shows first.
- data-go="Name" on any element navigates to that screen. Add data-transition="push|fade|up" (push is default).
- data-back goes to the previous screen.
- data-sheet="id" opens <div data-sheet-id="id">…</div> as a bottom sheet; data-close closes it.
- data-toggle toggles the "on" class on the element (use it for switches, likes, checkboxes).
- data-tab="id" inside a group shows the matching <div data-panel="id"> in the same parent and marks the tab "on".
- data-toast="Text" shows a short toast.
- Sample data: <template data-repeat="people|messages|tasks|products" data-limit="4"> with {{field}} placeholders repeats a row per item. data-sample="people.0.name" fills one element.
  people: name, role, avatar (initials), note. messages: from, text, time. tasks: title, due, done. products: name, price, detail.
- Taps and hovers get feedback automatically on a, button and [data-go]. Style states with the .on class.`;

export type SampleRow = Record<string, string>;

export const SAMPLE_DATA: Record<string, SampleRow[]> = {
  people: [
    { name: "Maya Chen", role: "Product lead", avatar: "MC", note: "Asked for weekly summaries" },
    { name: "Jordan Ellis", role: "Engineer", avatar: "JE", note: "Prefers async updates" },
    { name: "Priya Shah", role: "Designer", avatar: "PS", note: "Reviews on Fridays" },
    { name: "Sam Ortiz", role: "Researcher", avatar: "SO", note: "Runs the 360 sessions" },
    { name: "Ava Brooks", role: "Support", avatar: "AB", note: "Owns the escalation queue" },
  ],
  messages: [
    { from: "Maya Chen", text: "Can we try the shorter flow this week?", time: "9:14" },
    { from: "Jordan Ellis", text: "Shipped behind a flag.", time: "10:02" },
    { from: "Priya Shah", text: "The empty state reads better now.", time: "11:40" },
    { from: "Sam Ortiz", text: "Two of five got stuck on step two.", time: "13:05" },
  ],
  tasks: [
    { title: "Review onboarding copy", due: "Today", done: "" },
    { title: "Pick a variant for the test", due: "Tomorrow", done: "" },
    { title: "Send the readout", due: "Fri", done: "on" },
    { title: "Book three sessions", due: "Mon", done: "" },
  ],
  products: [
    { name: "Starter", price: "$0", detail: "One project, community support" },
    { name: "Studio", price: "$12", detail: "Unlimited projects, history" },
    { name: "Team", price: "$24", detail: "Shared foundations, review queue" },
  ],
};

/** Fills {{field}} placeholders in one row's markup. Unknown fields stay empty, never "undefined". */
export function fillRow(template: string, row: SampleRow, index: number): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    if (key === "index") return String(index + 1);
    const v = row[key];
    return v === undefined ? "" : escapeHtml(v);
  });
}

/** Repeats a template over a sample set, honouring a limit. */
export function fillRepeat(template: string, set: string, limit?: number, data: Record<string, SampleRow[]> = SAMPLE_DATA): string {
  const rows = (data[set] ?? []).slice(0, limit && limit > 0 ? limit : undefined);
  return rows.map((r, i) => fillRow(template, r, i)).join("");
}

/** Reads "people.0.name" from the sample data. */
export function samplePath(path: string, data: Record<string, SampleRow[]> = SAMPLE_DATA): string {
  const [set, idx, field] = path.split(".");
  if (!set || idx === undefined || !field) return "";
  return data[set]?.[Number(idx)]?.[field] ?? "";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Build directions: each variant explores a different core idea, not a palette swap. */
export const DIRECTIONS = {
  direct: "Direct: the most literal answer to the statement, the shortest path to the moment it is about",
  structural: "Structural: a different information architecture or flow, a different order of steps or a different home for the moment",
  expressive: "Expressive: a bolder interaction or visual idea that makes the moment memorable, still within the fidelity",
  minimal: "Minimal: remove everything that isn't the moment, one screen if one screen can carry it",
  refine: "Refine: keep the base variant's idea and fix what the notes and picks point at",
  layout: "Layout: keep the base variant's idea and try a different layout and hierarchy",
  tone: "Tone: keep the base variant's idea and change the copy, density and feel",
} as const;
export type Direction = keyof typeof DIRECTIONS;
export const FIRST_ROUND: Direction[] = ["direct", "structural", "expressive"];
export const FORK_ROUND: Direction[] = ["refine", "layout", "tone"];
