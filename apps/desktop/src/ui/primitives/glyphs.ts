import { createLucideIcon } from "lucide-react";

/**
 * Composer's own glyphs, drawn on Lucide's 24px grid so they take the same sizes and line weight
 * through <Icon>. Filled shapes set their own fill and turn the stroke off.
 */

/** The phase mark from the phase rail. Color it with `color: var(--phase-…)`. */
export const PhaseHexGlyph = createLucideIcon("composer-phase-hex", [
  ["path", { d: "M12 2.5 20.23 7.25v9.5L12 21.5l-8.23-4.75v-9.5Z", fill: "currentColor", stroke: "none", key: "hex" }],
]);

/** The Claude node glyph: six spokes from the center. */
export const ClaudeGlyph = createLucideIcon("composer-claude", [
  ["path", { d: "M12 3v18", key: "v" }],
  ["path", { d: "m4.2 7.5 15.6 9", key: "d1" }],
  ["path", { d: "m4.2 16.5 15.6-9", key: "d2" }],
]);
