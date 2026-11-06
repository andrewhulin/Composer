import { siAnthropic, siClaude, siFigma, siGithub, siLinear, siNotion, siPinterest, type SimpleIcon } from "simple-icons";
import { cx } from "./cx";
import styles from "./Logo.module.css";

/** Services Composer connects to. Slack, Statsig and Are.na aren't in Simple Icons yet: they show a letter tile. */
export type Brand = "figma" | "github" | "linear" | "pinterest" | "notion" | "anthropic" | "claude" | "slack" | "statsig" | "arena";

const MARKS: Partial<Record<Brand, SimpleIcon>> = {
  figma: siFigma,
  github: siGithub,
  linear: siLinear,
  pinterest: siPinterest,
  notion: siNotion,
  anthropic: siAnthropic,
  claude: siClaude,
};
const NAMES: Record<Brand, string> = {
  figma: "Figma", github: "GitHub", linear: "Linear", pinterest: "Pinterest", notion: "Notion",
  anthropic: "Anthropic", claude: "Claude", slack: "Slack", statsig: "Statsig", arena: "Are.na",
};

interface LogoProps {
  brand: Brand;
  size?: "sm" | "md" | "lg";
  /** "mono" follows the text color; "brand" uses the company's own color. */
  tone?: "mono" | "brand";
  className?: string;
}

/** A company mark (Simple Icons, CC0). Logos are filled shapes, so they don't go through <Icon>. */
export function Logo({ brand, size = "md", tone = "mono", className }: LogoProps) {
  const mark = MARKS[brand];
  if (!mark) {
    return (
      <span className={cx(styles.logo, styles.tile, styles[size], className)} role="img" aria-label={NAMES[brand]}>
        {NAMES[brand][0]}
      </span>
    );
  }
  return (
    <svg className={cx(styles.logo, styles[size], className)} viewBox="0 0 24 24" role="img" aria-label={NAMES[brand]}>
      <path d={mark.path} fill={tone === "brand" ? `#${mark.hex}` : "currentColor"} />
    </svg>
  );
}
