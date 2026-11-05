import { SAMPLE_DATA } from "@composer/engine";

/**
 * The runtime injected into every prototype. It runs inside the sandboxed iframe (opaque origin,
 * scripts only) and talks to Composer through postMessage. It does four jobs:
 *   1. the interaction kit (screens, sheets, toggles, tabs, toasts, sample data, tap feedback)
 *   2. serialization to Figma frames and the styles the prototype used
 *   3. tweak mode: pick an element, report its styles, apply a change without a rerun
 *   4. note mode: report the point and element a note is pinned to
 * Plain ES2017, no template literals, so it survives being embedded as a string.
 */

const KIT_CSS = `
[data-screen]:not(.kit-current){display:none !important}
[data-sheet-id]:not(.kit-open){display:none !important}
[data-panel]:not(.kit-shown){display:none !important}
a,button,[data-go],[data-back],[data-sheet],[data-toggle],[data-tab],[data-close]{cursor:pointer;transition:transform .12s ease,filter .12s ease,opacity .12s ease}
a:hover,button:hover,[data-go]:hover,[data-sheet]:hover,[data-toggle]:hover,[data-tab]:hover{filter:brightness(.95)}
a:active,button:active,[data-go]:active,[data-sheet]:active,[data-toggle]:active,[data-tab]:active{transform:scale(.97)}
.kit-in-push{animation:kit-push .28s cubic-bezier(.2,.8,.2,1)}
.kit-in-back{animation:kit-back .28s cubic-bezier(.2,.8,.2,1)}
.kit-in-fade{animation:kit-fade .22s ease}
.kit-in-up{animation:kit-up .3s cubic-bezier(.2,.8,.2,1)}
@keyframes kit-push{from{transform:translateX(24%);opacity:.4}to{transform:none;opacity:1}}
@keyframes kit-back{from{transform:translateX(-24%);opacity:.4}to{transform:none;opacity:1}}
@keyframes kit-fade{from{opacity:0}to{opacity:1}}
@keyframes kit-up{from{transform:translateY(16%);opacity:0}to{transform:none;opacity:1}}
.kit-scrim{position:fixed;inset:0;background:rgba(0,0,0,.32);z-index:9998;animation:kit-fade .2s ease}
[data-sheet-id].kit-open{position:fixed;left:0;right:0;bottom:0;z-index:9999;max-height:80%;overflow:auto;background:#fff;border-radius:16px 16px 0 0;padding:20px;box-shadow:0 -8px 32px rgba(0,0,0,.18);animation:kit-up .28s cubic-bezier(.2,.8,.2,1)}
.kit-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:10000;background:rgba(20,20,20,.92);color:#fff;font:500 14px/1.3 -apple-system,system-ui,sans-serif;padding:10px 14px;border-radius:10px;animation:kit-up .2s ease;pointer-events:none}
.kit-mode-tweak *,.kit-mode-note *{cursor:crosshair !important}
.kit-hover{outline:1px dashed rgba(255,98,0,.9) !important;outline-offset:1px}
.kit-picked{outline:2px solid #ff6200 !important;outline-offset:1px}
`;

const KIT_JS = String.raw`
(function () {
  var DATA = window.__COMPOSER_SAMPLE || {};
  var history = [];
  var current = null;
  var mode = "interact";
  var cidSeq = 0;
  var hoverEl = null;
  var picked = null;

  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function post(msg) { try { parent.postMessage(msg, "*"); } catch (e) {} }
  function event(kind, data) { var m = { composer: "rt-event", kind: kind }; for (var k in data) m[k] = data[k]; post(m); }
  function screens() { return $$("[data-screen]"); }
  function screenOf(el) { while (el && el !== document.body) { if (el.hasAttribute && el.hasAttribute("data-screen")) return el; el = el.parentNode; } return null; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function show(el, transition) {
    if (!el) return;
    screens().forEach(function (s) { s.classList.remove("kit-current", "kit-in-push", "kit-in-back", "kit-in-fade", "kit-in-up"); });
    el.classList.add("kit-current");
    if (transition) { void el.offsetWidth; el.classList.add("kit-in-" + transition); }
    current = el;
    closeSheets();
    event("screen", { name: el.getAttribute("data-screen") });
  }
  function go(name, transition) {
    var target = screens().filter(function (s) { return s.getAttribute("data-screen") === name; })[0];
    if (!target || target === current) return;
    if (current) history.push(current);
    show(target, transition || "push");
  }
  function back() { var prev = history.pop(); if (prev) show(prev, "back"); }

  function scrim() { var s = document.querySelector(".kit-scrim"); if (!s) { s = document.createElement("div"); s.className = "kit-scrim"; s.setAttribute("data-kit-gen", ""); s.addEventListener("click", closeSheets); document.body.appendChild(s); } return s; }
  function openSheet(id) { var sh = document.querySelector('[data-sheet-id="' + id + '"]'); if (!sh) return; scrim(); sh.classList.add("kit-open"); }
  function closeSheets() { $$(".kit-open").forEach(function (s) { s.classList.remove("kit-open"); }); var sc = document.querySelector(".kit-scrim"); if (sc) sc.remove(); }
  function toast(text) { var t = document.createElement("div"); t.className = "kit-toast"; t.setAttribute("data-kit-gen", ""); t.textContent = text; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1800); }
  function tab(el) {
    var id = el.getAttribute("data-tab");
    var group = el.parentNode;
    $$("[data-tab]", group).forEach(function (t) { t.classList.toggle("on", t === el); });
    var scope = group.parentNode || document;
    $$("[data-panel]", scope).forEach(function (p) { p.classList.toggle("kit-shown", p.getAttribute("data-panel") === id); });
  }

  function fill(template, row, i) {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (_, k) { if (k === "index") return String(i + 1); return row[k] === undefined ? "" : esc(row[k]); });
  }
  function repeat() {
    $$("template[data-repeat]").forEach(function (t) {
      var rows = (DATA[t.getAttribute("data-repeat")] || []).slice(0, Number(t.getAttribute("data-limit")) || undefined);
      var html = rows.map(function (r, i) { return fill(t.innerHTML, r, i); }).join("");
      var box = document.createElement("div");
      box.innerHTML = html;
      var frag = document.createDocumentFragment();
      Array.prototype.slice.call(box.children).forEach(function (c) { c.setAttribute("data-kit-gen", ""); frag.appendChild(c); });
      t.parentNode.insertBefore(frag, t.nextSibling);
    });
    $$("[data-sample]").forEach(function (el) {
      var p = el.getAttribute("data-sample").split(".");
      var v = DATA[p[0]] && DATA[p[0]][Number(p[1])] && DATA[p[0]][Number(p[1])][p[2]];
      if (v !== undefined) el.textContent = v;
    });
  }
  function initTabs() {
    var groups = [];
    $$("[data-tab]").forEach(function (t) { if (groups.indexOf(t.parentNode) < 0) groups.push(t.parentNode); });
    groups.forEach(function (g) { var first = g.querySelector("[data-tab].on") || g.querySelector("[data-tab]"); if (first) tab(first); });
  }

  function describe(el) {
    var tag = el.tagName.toLowerCase();
    var part = el.getAttribute("data-part");
    var text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
    return (part ? "[" + part + "] " : "") + tag + (text ? " “" + text + "”" : "");
  }
  function cid(el) { if (!el.getAttribute("data-cid")) el.setAttribute("data-cid", "c" + (++cidSeq)); return el.getAttribute("data-cid"); }
  function isLeaf(el) { return el.children.length === 0; }
  function stylesOf(el) {
    var cs = getComputedStyle(el);
    return {
      color: cs.color, background: cs.backgroundColor, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      padding: cs.padding, margin: cs.margin, gap: cs.gap, borderRadius: cs.borderTopLeftRadius,
    };
  }

  function onClick(e) {
    var el = e.target;
    if (mode !== "interact") {
      if (!(el instanceof Element)) return;
      e.preventDefault(); e.stopPropagation();
      if (mode === "tweak") {
        if (picked) picked.classList.remove("kit-picked");
        picked = el; el.classList.add("kit-picked");
        event("pick", { cid: cid(el), label: describe(el), leaf: isLeaf(el), text: isLeaf(el) ? el.textContent : null, styles: stylesOf(el) });
      } else {
        var sc = screenOf(el);
        event("point", { x: Math.round(e.clientX), y: Math.round(e.clientY), screen: sc ? sc.getAttribute("data-screen") : null, element: describe(el) });
      }
      return;
    }
    var a = el.closest ? el.closest("[data-go],[data-back],[data-sheet],[data-close],[data-toggle],[data-tab],[data-toast]") : null;
    if (!a) return;
    if (a.tagName === "A") e.preventDefault();
    if (a.hasAttribute("data-toggle")) a.classList.toggle("on");
    if (a.hasAttribute("data-tab")) tab(a);
    if (a.hasAttribute("data-toast")) toast(a.getAttribute("data-toast"));
    if (a.hasAttribute("data-close")) closeSheets();
    if (a.hasAttribute("data-sheet")) openSheet(a.getAttribute("data-sheet"));
    if (a.hasAttribute("data-back")) back();
    if (a.hasAttribute("data-go")) go(a.getAttribute("data-go"), a.getAttribute("data-transition"));
  }
  function onOver(e) {
    if (mode === "interact") return;
    if (hoverEl) hoverEl.classList.remove("kit-hover");
    hoverEl = e.target instanceof Element ? e.target : null;
    if (hoverEl) hoverEl.classList.add("kit-hover");
  }
  function setMode(m) {
    mode = m;
    document.documentElement.classList.remove("kit-mode-tweak", "kit-mode-note");
    if (m !== "interact") document.documentElement.classList.add("kit-mode-" + m);
    if (hoverEl) { hoverEl.classList.remove("kit-hover"); hoverEl = null; }
    if (picked && m !== "tweak") { picked.classList.remove("kit-picked"); picked = null; }
  }

  // ---- serialization to Figma frames ----
  function px(v) { return parseFloat(v) || 0; }
  function transparent(c) { return !c || c === "transparent" || /rgba\(.*,\s*0\)$/.test(c); }
  function family(f) { return (f || "").split(",")[0].replace(/["']/g, "").trim() || "Inter"; }
  function nodeFor(el, ox, oy, used) {
    var cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return null;
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    var tag = el.tagName.toLowerCase();
    var name = el.getAttribute("data-part") || el.getAttribute("aria-label") || el.getAttribute("data-screen") || tag;
    var base = { name: name, x: Math.round(r.left - ox), y: Math.round(r.top - oy), w: Math.round(r.width), h: Math.round(r.height) };
    var radius = px(cs.borderTopLeftRadius);
    if (radius > 0) used.radii.push(radius);
    if (tag === "img" || tag === "svg" || tag === "canvas" || tag === "video" || tag === "picture") {
      base.type = "image"; base.radius = radius; return base;
    }
    var children = [];
    var hasText = false;
    Array.prototype.forEach.call(el.childNodes, function (c) {
      if (c.nodeType === 3) {
        var t = c.textContent.replace(/\s+/g, " ").trim();
        if (!t) return;
        var range = document.createRange(); range.selectNodeContents(c);
        var rr = range.getBoundingClientRect();
        if (rr.width < 1) return;
        hasText = true;
        children.push({ type: "text", name: t.slice(0, 40), x: Math.round(rr.left - r.left), y: Math.round(rr.top - r.top), w: Math.ceil(rr.width) + 1, h: Math.ceil(rr.height),
          text: { family: family(cs.fontFamily), weight: Number(cs.fontWeight) || 400, characters: t, size: px(cs.fontSize), color: cs.color, lineHeight: px(cs.lineHeight), align: cs.textAlign } });
      } else if (c.nodeType === 1 && !c.hasAttribute("data-kit") && c.tagName !== "SCRIPT" && c.tagName !== "STYLE" && c.tagName !== "TEMPLATE") {
        var n = nodeFor(c, r.left, r.top, used);
        if (n) children.push(n);
      }
    });
    if (hasText) { used.colors.push(cs.color); used.fontSizes.push(px(cs.fontSize)); }
    if (!transparent(cs.backgroundColor)) used.colors.push(cs.backgroundColor);
    var bw = px(cs.borderTopWidth);
    if (bw > 0 && cs.borderTopStyle !== "none") used.colors.push(cs.borderTopColor);
    var flex = cs.display === "flex" || cs.display === "inline-flex";
    var layout = null;
    if (flex) {
      var row = cs.flexDirection.indexOf("row") === 0;
      layout = { dir: row ? "row" : "col", gap: px(row ? cs.columnGap : cs.rowGap), padding: [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)], justify: cs.justifyContent, align: cs.alignItems };
    }
    base.type = "frame";
    base.fill = transparent(cs.backgroundColor) ? null : cs.backgroundColor;
    base.radius = radius;
    if (bw > 0 && cs.borderTopStyle !== "none") base.stroke = { color: cs.borderTopColor, width: bw };
    base.layout = layout;
    base.children = children;
    return base;
  }
  function serialize() {
    var used = { colors: [], radii: [], fontSizes: [] };
    var list = screens();
    var was = current;
    var mark = list.length ? list : [document.body];
    var tree = mark.map(function (s) {
      if (list.length) { screens().forEach(function (x) { x.classList.remove("kit-current"); }); s.classList.add("kit-current"); }
      var r = s.getBoundingClientRect();
      var n = nodeFor(s, r.left, r.top, used);
      if (n) { n.name = s.getAttribute("data-screen") || "Screen"; n.x = 0; n.y = 0; }
      return n;
    }).filter(Boolean);
    if (list.length) { screens().forEach(function (x) { x.classList.remove("kit-current"); }); if (was) was.classList.add("kit-current"); }
    return { tree: tree, used: used };
  }

  // ---- export: the prototype as Claude wrote it, plus the designer's direct tweaks ----
  function exportHtml() {
    var doc = document.documentElement.cloneNode(true);
    Array.prototype.forEach.call(doc.querySelectorAll("[data-kit],[data-kit-gen]"), function (n) { n.remove(); });
    Array.prototype.forEach.call(doc.querySelectorAll("*"), function (n) {
      n.removeAttribute("data-cid");
      if (n.classList && n.classList.length) {
        Array.prototype.slice.call(n.classList).forEach(function (c) { if (c.indexOf("kit-") === 0) n.classList.remove(c); });
        if (!n.classList.length) n.removeAttribute("class");
      }
    });
    doc.classList.remove("kit-mode-tweak", "kit-mode-note");
    if (!doc.classList.length) doc.removeAttribute("class");
    return "<!doctype html>\n" + doc.outerHTML;
  }
  function apply(id, prop, value) {
    var el = document.querySelector('[data-cid="' + id + '"]');
    if (!el) return false;
    if (prop === "text") { if (isLeaf(el)) el.textContent = value; else return false; }
    else el.style.setProperty(prop, value);
    return stylesOf(el);
  }

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.composer !== "rt") return;
    var reply = { composer: "rt-reply", id: m.id };
    try {
      if (m.op === "serialize") reply.result = serialize();
      else if (m.op === "mode") { setMode(m.mode); reply.result = true; }
      else if (m.op === "apply") reply.result = apply(m.cid, m.prop, m.value);
      else if (m.op === "export") reply.result = exportHtml();
      else if (m.op === "go") { go(m.screen, "fade"); reply.result = true; }
      else reply.error = "unknown op";
    } catch (err) { reply.error = String(err && err.message || err); }
    post(reply);
  });

  function init() {
    repeat();
    initTabs();
    var list = screens();
    if (list.length) show(list[0], null);
    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseover", onOver, true);
    event("ready", { screens: list.map(function (s) { return s.getAttribute("data-screen"); }) });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
`;

/** Injects the kit into a prototype document, in its head, ahead of the prototype's own code. */
export function injectKit(html: string): string {
  const tags = `<style data-kit>${KIT_CSS}</style><script data-kit>window.__COMPOSER_SAMPLE=${JSON.stringify(SAMPLE_DATA).replace(/</g, "\\u003c")};</script><script data-kit>${KIT_JS}</script>`;
  const head = /<head[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + tags + html.slice(head.index + head[0].length);
  const root = /<html[^>]*>/i.exec(html);
  if (root) return html.slice(0, root.index + root[0].length) + `<head>${tags}</head>` + html.slice(root.index + root[0].length);
  return tags + html;
}
