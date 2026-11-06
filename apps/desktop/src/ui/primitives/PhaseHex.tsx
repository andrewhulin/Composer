import type { Phase } from "@composer/core";
import { Icon, type IconSize } from "./Icon";
import { PhaseHexGlyph } from "./glyphs";

/** The phase mark from the phase rail, in the phase's color. */
export function PhaseHex({ phase, size = "sm" }: { phase: Phase; size?: IconSize }) {
  return <Icon icon={PhaseHexGlyph} size={size} style={{ color: `var(--phase-${phase})` }} />;
}
