import { create } from "zustand";
import { ulid, type Phase } from "@composer/core";
import { useProject } from "./project";

export interface Comment {
  id: string;
  phase: Phase;
  loop: number;
  x: number;
  y: number;
  text: string;
  createdAt: string;
}

/** Notes pinned to the canvas. They annotate the work; they never feed a prompt or a snapshot. */
export const useComments = create<{ list: Comment[]; editing: string | null }>(() => ({ list: [], editing: null }));

const key = () => `comments:${useProject.getState().project?.id ?? "none"}`;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void useProject.getState().repo?.setSetting(key(), useComments.getState().list), 300);
}

export async function loadComments() {
  const list = (await useProject.getState().repo?.getSetting<Comment[]>(key())) ?? [];
  useComments.setState({ list, editing: null });
}

export const comments = {
  add(at: { x: number; y: number }) {
    const { activePhase, loop } = useProject.getState();
    const c: Comment = { id: ulid(), phase: activePhase, loop, x: at.x, y: at.y, text: "", createdAt: new Date().toISOString() };
    useComments.setState((s) => ({ list: [...s.list, c], editing: c.id }));
    save();
    return c;
  },
  update(id: string, patch: Partial<Pick<Comment, "x" | "y" | "text">>) {
    useComments.setState((s) => ({ list: s.list.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
    save();
  },
  remove(id: string) {
    useComments.setState((s) => ({ list: s.list.filter((c) => c.id !== id), editing: s.editing === id ? null : s.editing }));
    save();
  },
  edit(id: string | null) {
    const { list, editing } = useComments.getState();
    // Leaving a note empty throws it away.
    const prev = list.find((c) => c.id === editing);
    if (prev && prev.id !== id && !prev.text.trim()) comments.remove(prev.id);
    useComments.setState({ editing: id });
  },
};
