import type { Phase } from "@composer/core";
import understand from "../../assets/icons/hex-understand.svg";
import define from "../../assets/icons/hex-define.svg";
import build from "../../assets/icons/hex-build.svg";
import validate from "../../assets/icons/hex-validate.svg";
import share from "../../assets/icons/hex-share.svg";

const HEX: Record<Phase, string> = { understand, define, build, validate, share };

/** The phase glyph from the Figma phase rail (11 × 10). */
export function PhaseHex({ phase }: { phase: Phase }) {
  return <img src={HEX[phase]} alt="" width={11} height={10} style={{ padding: "0 0.75px" }} />;
}
