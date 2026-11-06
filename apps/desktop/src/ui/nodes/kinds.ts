import type { ItemKind, PortType, SourcePlatform } from "@composer/core";

/** Badge letter, label and accent for context kinds (Figma 07 · Collect). */
export const KIND_BADGE: Record<ItemKind, { letter: string; label: string; color: string; rgb: string }> = {
  quote: { letter: "Q", label: "Quote", color: "var(--phase-understand)", rgb: "var(--rgb-understand)" },
  transcript: { letter: "I", label: "Interview", color: "var(--phase-understand)", rgb: "var(--rgb-understand)" },
  ticket: { letter: "L", label: "Ticket", color: "var(--phase-build)", rgb: "var(--rgb-build)" },
  data: { letter: "D", label: "Data", color: "var(--phase-validate)", rgb: "var(--rgb-validate)" },
  pin: { letter: "P", label: "Pin", color: "var(--phase-define)", rgb: "var(--rgb-define)" },
  image: { letter: "P", label: "Image", color: "var(--phase-define)", rgb: "var(--rgb-define)" },
  screen: { letter: "M", label: "Screen", color: "var(--text-secondary)", rgb: "var(--rgb-ink)" },
  link: { letter: "↗", label: "Link", color: "var(--text-secondary)", rgb: "var(--rgb-ink)" },
  request: { letter: "R", label: "Request", color: "var(--signal-hypothesis)", rgb: "var(--rgb-hypothesis)" },
  note: { letter: "N", label: "Note", color: "var(--text-secondary)", rgb: "var(--rgb-ink)" },
  file: { letter: "F", label: "File", color: "var(--text-secondary)", rgb: "var(--rgb-ink)" },
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
  video: "Reference video",
};

export const PORT_COLOR: Record<PortType, string> = {
  context: "var(--text-secondary)",
  phase_output: "var(--phase)",
  hypothesis: "var(--signal-hypothesis)",
  text: "var(--text-primary)",
};
