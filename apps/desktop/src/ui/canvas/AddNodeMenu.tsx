import { useRef, useState } from "react";
import { actions, toast } from "../../store/project";
import { ingestFile, ingestText, ingestUrl, isUrl } from "../../app/ingest";
import { Button, Input, Menu, MenuDivider, MenuItem, Popover, Textarea } from "../primitives";
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
      <Popover className={styles.menu}>
        <form
          className={styles.form}
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
            <Textarea
              autoFocus
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
            <Input
              autoFocus
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
            <Button variant="secondary" onClick={() => setMode("menu")}>
              Back
            </Button>
            <Button type="submit" variant="primary" shortcut={mode === "text" ? "⌘↵" : "↵"}>
              Add {mode === "link" ? "link" : "context"}
            </Button>
          </div>
        </form>
      </Popover>
    );
  }

  return (
    <Popover padding="sm" className={styles.menu}>
      <Menu label="Add node">
        <MenuItem hint="one prompt" onClick={() => run(() => actions.addClaude())}>
          Claude step
        </MenuItem>
        <MenuItem hint="memory block" onClick={() => run(() => actions.addHypothesis())}>
          Hypothesis
        </MenuItem>
        <MenuDivider />
        <MenuItem hint="⌘V works too" onClick={() => setMode("text")}>
          Quote or notes
        </MenuItem>
        <MenuItem hint="fetched once" onClick={() => setMode("link")}>
          Link
        </MenuItem>
        <MenuItem hint="txt, md, vtt, images" onClick={() => files.current?.click()}>
          Files…
        </MenuItem>
      </Menu>
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
    </Popover>
  );
}
