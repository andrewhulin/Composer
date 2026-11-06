import { useEffect, useRef } from "react";
import type { NodeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { comments, useComments } from "../../store/comments";
import { ago, useNow } from "../../hooks/useNow";
import { IconButton } from "../primitives/Button";
import styles from "./CommentNode.module.css";

/** A sticky note on the canvas. Double-click to edit; an empty note disappears when you leave it. */
export function CommentNode({ id, selected }: NodeProps) {
  const cid = id.slice("comment:".length);
  const c = useComments((s) => s.list.find((x) => x.id === cid));
  const editing = useComments((s) => s.editing === cid);
  const now = useNow(true, 30_000);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) area.current?.focus();
  }, [editing]);
  if (!c) return null;
  return (
    <div className={styles.note} data-selected={selected || undefined} onDoubleClick={() => comments.edit(cid)}>
      <div className={styles.head}>
        <span className={styles.meta}>Note · {ago(c.createdAt, now)}</span>
        <IconButton icon={X} label="Delete note" size="sm" className={`${styles.remove} nodrag`} onClick={() => comments.remove(cid)} />
      </div>
      {editing ? (
        <textarea
          ref={area}
          className={`${styles.text} nodrag`}
          value={c.text}
          placeholder="Write a note…"
          rows={Math.max(2, c.text.split("\n").length)}
          onChange={(e) => comments.update(cid, { text: e.target.value })}
          onBlur={() => comments.edit(null)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape" || (e.key === "Enter" && e.metaKey)) comments.edit(null);
          }}
        />
      ) : (
        <p className={styles.text}>{c.text}</p>
      )}
    </div>
  );
}
