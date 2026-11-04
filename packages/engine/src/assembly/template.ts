const REF = /\{\{|\}\}|\{([A-Za-z][\w-]*)\}/g;

/** Names referenced as `{name}` in an instruction. `{{` and `}}` are literal braces. */
export function templateRefs(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(REF)) if (m[1] && !out.includes(m[1])) out.push(m[1]);
  return out;
}

export interface RenderedTemplate {
  text: string;
  unknown: string[];
}

/**
 * Renders references as the tag name of the document they point at (`{interviews}` →
 * `<interviews>`). Content is never pasted at the reference, so each document appears once
 * and the prompt prefix stays cacheable.
 */
export function renderTemplate(template: string, known: (name: string) => boolean): RenderedTemplate {
  const unknown: string[] = [];
  const text = template.replace(REF, (whole, name: string | undefined) => {
    if (whole === "{{") return "{";
    if (whole === "}}") return "}";
    if (!known(name!)) {
      if (!unknown.includes(name!)) unknown.push(name!);
      return whole;
    }
    return `<${name}>`;
  });
  return { text, unknown };
}
