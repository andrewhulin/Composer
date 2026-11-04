import type { ItemKind, PortType, SourcePlatform } from "@composer/core";

/** Badge letter, label and accent for context kinds (Figma 07 · Collect). */
export const KIND_BADGE: Record<ItemKind, { letter: string; label: string; color: string; rgb: string }> = {
  quote: { letter: "Q", label: "Quote", color: "var(--phase-understand)", rgb: "222, 138, 69" },
  transcript: { letter: "I", label: "Interview", color: "var(--phase-understand)", rgb: "222, 138, 69" },
  ticket: { letter: "L", label: "Ticket", color: "var(--phase-build)", rgb: "152, 135, 227" },
  data: { letter: "D", label: "Data", color: "var(--phase-validate)", rgb: "82, 172, 217" },
  pin: { letter: "P", label: "Pin", color: "var(--phase-define)", rgb: "224, 90, 78" },
  image: { letter: "P", label: "Image", color: "var(--phase-define)", rgb: "224, 90, 78" },
  screen: { letter: "M", label: "Screen", color: "var(--text-secondary)", rgb: "238, 237, 234" },
  link: { letter: "↗", label: "Link", color: "var(--text-secondary)", rgb: "238, 237, 234" },
  request: { letter: "R", label: "Request", color: "var(--signal-hypothesis)", rgb: "227, 194, 90" },
  note: { letter: "N", label: "Note", color: "var(--text-secondary)", rgb: "238, 237, 234" },
  file: { letter: "F", label: "File", color: "var(--text-secondary)", rgb: "238, 237, 234" },
};

export const PLATFORM_LABEL: Record<SourcePlatform, string> = {
  file: "File",
  image: "Image",
  link: "Link",
  paste: "Paste",
  transcript: "Interviews",
  linear: "Linear",
  figma: "Figma",
  arena: "Are.na",
  pinterest: "Pinterest",
  mobbin: "Mobbin",
  "60fps": "60fps",
  request: "Requests",
  data: "Data",
  slack: "Slack",
  statsig: "Statsig",
  findings: "Findings",
};

export const PORT_COLOR: Record<PortType, string> = {
  context: "var(--text-secondary)",
  phase_output: "var(--phase)",
  hypothesis: "var(--signal-hypothesis)",
  text: "var(--text-primary)",
};
