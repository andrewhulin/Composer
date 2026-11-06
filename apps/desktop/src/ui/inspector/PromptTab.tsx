import { useState } from "react";
import type { AssembledPrompt } from "@composer/engine";
import { Diamond } from "lucide-react";
import { Icon } from "../primitives";
import { formatTokens } from "../primitives/format";
import styles from "./PromptTab.module.css";

type Block = { label: string; text: string; cached?: string };

/** Exactly what the node sends: every block in order, where the cache breaks, and what was trimmed. */
export function PromptTab({ prompt }: { prompt: AssembledPrompt }) {
  const [open, setOpen] = useState<string | null>(null);
  const content = prompt.messages[0]?.content as { text: string; cache_control?: { ttl?: string } }[];
  const blocks: Block[] = [
    { label: "System · charter", text: prompt.system[0]!.text },
    { label: "System · foundations", text: prompt.system[1]!.text, cached: "cache 1h" },
    { label: "System · learned rules", text: prompt.system[2]!.text, cached: "cache" },
    { label: "Project memory + pins", text: content[0]!.text, cached: "cache" },
    { label: "Hypothesis + weighted context", text: content[1]!.text, cached: "cache" },
    { label: "Instruction", text: content[2]!.text },
  ];
  const r = prompt.report;
  return (
    <div className={styles.tab}>
      <div className={styles.summary}>
        <span>≈ {formatTokens(r.total)} tokens</span>
        <span>
          context budget {formatTokens(r.contextBudget)} of {formatTokens(r.budget)}
        </span>
      </div>
      {blocks.map((b) => (
        <div key={b.label} className={styles.block}>
          <div className={styles.head}>
            <span className="caps">{b.label}</span>
            {b.cached && (
              <span className={styles.cache}>
                <Icon icon={Diamond} size="sm" fill="currentColor" />
                {b.cached}
              </span>
            )}
          </div>
          <pre className={styles.text}>{b.text}</pre>
        </div>
      ))}
      <span className="caps">What was trimmed</span>
      {r.items.map((i) => (
        <div key={i.alias} className={styles.item}>
          <button type="button" className={styles.itemHead} onClick={() => setOpen(open === i.alias ? null : i.alias)}>
            <span>
              {i.title} <em>{i.weight}</em>
            </span>
            <span>
              {formatTokens(i.used)} / {formatTokens(i.demand)}
              {i.dropped.length ? ` · ${i.dropped.length} cut` : ""}
            </span>
          </button>
          {open === i.alias &&
            (i.dropped.length ? (
              <div className={styles.dropped}>
                {i.dropped.map((d, k) => (
                  <p key={k}>
                    {d.label && <span>{d.label}</span>} {d.text}
                  </p>
                ))}
              </div>
            ) : (
              <p className={styles.none}>{i.weight === "mute" ? "Muted: left out entirely." : "Nothing cut. It went in whole."}</p>
            ))}
        </div>
      ))}
    </div>
  );
}
