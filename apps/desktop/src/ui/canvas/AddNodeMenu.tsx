import { useRef, useState } from "react";
import { actions, toast } from "../../store/project";
import { ingestFile, ingestText, ingestUrl, isUrl } from "../../app/ingest";
import styles from "./AddNodeMenu.module.css";

/** Add node (N): a Claude step, a hypothesis, or context from text, a link or files. */
export function AddNodeMenu({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"menu" | "text" | "link">("menu");
  const [value, setValue] = useState("");
  const files = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<unknown> | unknown) => {
    try {
      await fn();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  if (mode !== "menu") {
    return (
      <form
        className={styles.menu}
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim();
          if (!v) return;
          if (mode === "link") {
            if (!isUrl(v)) return toast("That isn't a link.", "error");
            void run(async () => actions.addSource(await ingestUrl(v)));
          } else void run(() => actions.addSource(ingestText(v)));
        }}
      >
        {mode === "text" ? (
          <textarea
            autoFocus
            className={styles.field}
            rows={6}
            placeholder="Paste a quote, notes, or a transcript (Speaker: line)…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) e.currentTarget.form?.requestSubmit();
              if (e.key === "Escape") onClose();
              e.stopPropagation();
            }}
          />
        ) : (
          <input
            autoFocus
            className={styles.field}
            placeholder="https://…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              e.stopPropagation();
            }}
          />
        )}
        <div className={styles.row}>
          <button type="button" className={styles.secondary} onClick={() => setMode("menu")}>
            Back
          </button>
          <button type="submit" className={styles.primary}>
            Add {mode === "link" ? "link" : "context"} <span>{mode === "text" ? "⌘↵" : "↵"}</span>
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.menu} role="menu">
      <button type="button" role="menuitem" onClick={() => run(() => actions.addClaude())}>
        Claude step <span>one prompt</span>
      </button>
      <button type="button" role="menuitem" onClick={() => run(() => actions.addHypothesis())}>
        Hypothesis <span>memory block</span>
      </button>
      <hr />
      <button type="button" role="menuitem" onClick={() => setMode("text")}>
        Quote or notes <span>⌘V works too</span>
      </button>
      <button type="button" role="menuitem" onClick={() => setMode("link")}>
        Link <span>fetched once</span>
      </button>
      <button type="button" role="menuitem" onClick={() => files.current?.click()}>
        Files… <span>txt, md, vtt, images</span>
      </button>
      <input
        ref={files}
        type="file"
        multiple
        hidden
        accept=".txt,.md,.markdown,.vtt,.srt,.json,.csv,image/*"
        onChange={(e) => {
          const list = [...(e.target.files ?? [])];
          void run(async () => {
            for (const f of list) await actions.addSource(await ingestFile(f));
          });
        }}
      />
    </div>
  );
}
