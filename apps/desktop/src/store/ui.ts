import { create } from "zustand";

export type InspectorTab = "preview" | "prompt" | "node";
export type CanvasTool = "select" | "pan";

interface UiState {
  focus: boolean;
  inspectorTab: InspectorTab;
  tool: CanvasTool;
  zoom: number;
  settingsOpen: boolean;
  addMenuOpen: boolean;
  toggleFocus: () => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setTool: (tool: CanvasTool) => void;
  setZoom: (zoom: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setAddMenuOpen: (open: boolean) => void;
}

/** View state only. Project data lives in the project store. */
export const useUi = create<UiState>((set) => ({
  focus: true,
  inspectorTab: "preview",
  tool: "select",
  zoom: 1,
  settingsOpen: false,
  addMenuOpen: false,
  toggleFocus: () => set((s) => ({ focus: !s.focus })),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => set({ zoom }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setAddMenuOpen: (addMenuOpen) => set({ addMenuOpen }),
}));
