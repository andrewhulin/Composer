// Composer's UI stylesheets use tokens (apps/desktop/src/styles/tokens.css) for color, type and
// spacing. These rules keep raw values out of everything except the token file itself.
const TOKEN = String.raw`var\(--[a-z0-9-]+\)`;
const CALC = String.raw`calc\([^;]*var\(--[a-z0-9-]+\)[^;]*\)`;
const SPACE = String.raw`(${TOKEN}|${CALC}|0|auto|-?1px|\d+(\.\d+)?(%|vh|vw))`;
const spacing = (max) => new RegExp(String.raw`^(${SPACE}\s*){1,${max}}$`);

export default {
  ignoreFiles: [
    "**/node_modules/**",
    "**/dist/**",
    "**/src-tauri/**",
    "packages/**",
    "apps/desktop/src/styles/tokens.css",
    "apps/desktop/src/styles/fonts.css",
  ],
  rules: {
    "color-no-hex": true,
    "color-named": "never",
    "function-disallowed-list": ["hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color"],
    // rgba(var(--rgb-ink), 0.06) is fine; rgba(238, 237, 234, 0.06) is a raw color.
    "declaration-property-value-disallowed-list": { "/.*/": [String.raw`/rgba?\(\s*[\d.]/`] },
    "declaration-property-value-allowed-list": {
      "font-size": [String.raw`/^var\(--fs-[a-z]+\)$/`, "inherit"],
      "/^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$/": [spacing(4)],
      "/^(gap|row-gap|column-gap)$/": [spacing(2)],
    },
  },
};
