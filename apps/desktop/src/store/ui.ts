import { create } from "zustand";
import type { Phase } from "@composer/core";
import { workspace } from "../fixtures/workspace";

export type InspectorTab = "preview" | "prompt" | "node";
export type CanvasTool = "select" | "pan" | "add" | "comment";

interface UiState {
  activePhase: Phase;
  focus: boolean;
  inspectorTab: InspectorTab;
  tool: CanvasTool;
  chipEnabled: Record<string, boolean>;
  setActivePhase: (phase: Phase) => void;
  toggleFocus: () => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setTool: (tool: CanvasTool) => void;
  toggleChip: (id: string) => void;
}

export const useUi = create<UiState>((set) => ({
  activePhase: "define",
  focus: true,
  inspectorTab: "preview",
  tool: "select",
  chipEnabled: Object.fromEntries(workspace.chips.map((c) => [c.id, c.enabled])),
  setActivePhase: (activePhase) => set({ activePhase }),
  toggleFocus: () => set((s) => ({ focus: !s.focus })),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setTool: (tool) => set({ tool }),
  toggleChip: (id) => set((s) => ({ chipEnabled: { ...s.chipEnabled, [id]: !s.chipEnabled[id] } })),
}));
