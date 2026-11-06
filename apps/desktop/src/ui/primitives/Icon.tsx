import type { LucideIcon, LucideProps } from "lucide-react";
import { cx } from "./cx";
import styles from "./Icon.module.css";

export type IconSize = "sm" | "md" | "lg";

export interface IconProps extends Omit<LucideProps, "size" | "ref"> {
  /** A Lucide icon, or one of Composer's own glyphs from ./glyphs. */
  icon: LucideIcon;
  /** sm 14px for dense rows, md 16px beside body text, lg 20px in toolbars. */
  size?: IconSize;
  /** Spoken name. Leave it out when the icon sits beside text that already says it. */
  label?: string;
}

/** Every icon in the app goes through here, so size and line weight come from tokens. */
export function Icon({ icon: Glyph, size = "md", label, className, ...rest }: IconProps) {
  return (
    <Glyph
      className={cx(styles.icon, styles[size], className)}
      nonScalingStroke
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable={false}
      {...rest}
    />
  );
}
