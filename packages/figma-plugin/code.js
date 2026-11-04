// Design Composer companion plugin. Builds Composer prototypes as editable frames (flexbox →
// auto layout) on a "Design Composer" page, and sends a selected frame back to Composer.
figma.showUI(__html__, { width: 340, height: 460, themeColors: true });

async function composerPage() {
  let page = figma.root.children.find((p) => p.name === "Design Composer");
  if (!page) {
    page = figma.createPage();
    page.name = "Design Composer";
  }
  await figma.setCurrentPageAsync(page);
  return page;
}

function parseColor(c) {
  const m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\s*\)/.exec(c || "");
  if (!m) return null;
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (a === 0) return null;
  return { color: { r: m[1] / 255, g: m[2] / 255, b: m[3] / 255 }, opacity: a };
}

function solid(c) {
  const p = parseColor(c);
  return p ? [{ type: "SOLID", color: p.color, opacity: p.opacity }] : [];
}

const STYLE = (w) => (w >= 700 ? "Bold" : w >= 600 ? "Semi Bold" : w >= 500 ? "Medium" : "Regular");

async function font(family, weight) {
  const tries = [
    { family, style: STYLE(weight) },
    { family, style: "Regular" },
    { family: "Inter", style: STYLE(weight) },
    { family: "Inter", style: "Regular" },
  ];
  for (const f of tries) {
    try {
      await figma.loadFontAsync(f);
      return f;
    } catch {
      // try the next one
    }
  }
  return { family: "Inter", style: "Regular" };
}

const ALIGN = { "flex-start": "MIN", start: "MIN", normal: "MIN", stretch: "MIN", baseline: "MIN", center: "CENTER", "flex-end": "MAX", end: "MAX", "space-between": "SPACE_BETWEEN" };

async function build(n, parent, parentHasLayout) {
  if (n.type === "text") {
    const t = figma.createText();
    t.fontName = await font(n.text.family, n.text.weight);
    t.characters = n.text.characters;
    t.fontSize = Math.max(1, n.text.size);
    t.fills = solid(n.text.color);
    if (n.text.lineHeight) t.lineHeight = { value: n.text.lineHeight, unit: "PIXELS" };
    t.textAlignHorizontal = n.text.align === "center" ? "CENTER" : n.text.align === "right" || n.text.align === "end" ? "RIGHT" : "LEFT";
    t.name = n.name;
    parent.appendChild(t);
    t.resize(Math.max(1, n.w), Math.max(1, n.h));
    t.textAutoResize = "HEIGHT";
    if (!parentHasLayout) {
      t.x = n.x;
      t.y = n.y;
    }
    return t;
  }
  const f = n.type === "image" ? figma.createRectangle() : figma.createFrame();
  f.name = n.type === "image" ? `${n.name} (image)` : n.name;
  parent.appendChild(f);
  f.resize(Math.max(1, n.w), Math.max(1, n.h));
  f.fills = n.type === "image" ? [{ type: "SOLID", color: { r: 0.85, g: 0.84, b: 0.82 } }] : solid(n.fill);
  if (n.radius) f.cornerRadius = n.radius;
  if (n.stroke) {
    f.strokes = solid(n.stroke.color);
    f.strokeWeight = n.stroke.width;
  }
  if (!parentHasLayout) {
    f.x = n.x;
    f.y = n.y;
  }
  if (n.type === "frame") {
    if (n.layout) {
      f.layoutMode = n.layout.dir === "row" ? "HORIZONTAL" : "VERTICAL";
      f.itemSpacing = n.layout.gap || 0;
      [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft] = n.layout.padding;
      f.primaryAxisAlignItems = ALIGN[n.layout.justify] || "MIN";
      f.counterAxisAlignItems = ALIGN[n.layout.align] === "SPACE_BETWEEN" ? "MIN" : ALIGN[n.layout.align] || "MIN";
      f.primaryAxisSizingMode = "FIXED";
      f.counterAxisSizingMode = "FIXED";
    } else {
      f.clipsContent = true;
    }
    for (const c of n.children || []) await build(c, f, !!n.layout);
  }
  return f;
}

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === "paste") {
      const payload = JSON.parse(msg.text);
      if (payload.composer !== "figma-frames") throw new Error("That isn't something Design Composer copied.");
      const page = await composerPage();
      let x = page.children.reduce((m, n) => Math.max(m, n.x + n.width), 0) + (page.children.length ? 120 : 0);
      const made = [];
      for (const screen of payload.tree) {
        const f = await build(screen, page, false);
        f.x = x;
        f.y = 0;
        f.name = `${payload.title || "Prototype"} · ${screen.name}`;
        x += f.width + 80;
        made.push(f);
      }
      figma.currentPage.selection = made;
      figma.viewport.scrollAndZoomIntoView(made);
      figma.ui.postMessage({ type: "done", text: `Built ${made.length} frame${made.length === 1 ? "" : "s"} on the Design Composer page.` });
    }
    if (msg.type === "selection") {
      const sel = figma.currentPage.selection[0];
      if (!sel) throw new Error("Select a frame first.");
      const bytes = await sel.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: 768 } });
      const text = "findAll" in sel ? sel.findAll((n) => n.type === "TEXT").map((t) => t.characters) : [];
      const url = figma.fileKey ? `https://www.figma.com/design/${figma.fileKey}?node-id=${sel.id.replace(":", "-")}` : undefined;
      figma.ui.postMessage({ type: "selection", text: JSON.stringify({ composer: "figma-selection", v: 1, name: sel.name, text, png: figma.base64Encode(bytes), url }) });
    }
  } catch (e) {
    figma.ui.postMessage({ type: "error", text: String(e && e.message ? e.message : e) });
  }
};
