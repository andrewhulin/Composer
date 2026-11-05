/** Regenerates the app icon PNG from icon.svg: `node icon.ts <out.png>`, then `pnpm tauri icon <out.png>` in apps/desktop. */
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(path.join(here, "../../apps/desktop/src-tauri/icons/icon.svg"), "utf8");
const out = process.argv[2] ?? path.join(here, "out/icon.png");
const serveUrl = await bundle({ entryPoint: path.join(here, "src/icon-entry.tsx") });
const composition = await selectComposition({ serveUrl, id: "Icon", inputProps: { svg } });
await renderStill({ composition, serveUrl, output: out, imageFormat: "png", inputProps: { svg } });
console.log(out);
