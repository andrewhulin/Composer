import { create } from "zustand";

export type InspectorTab = "preview" | "prompt" | "node";
export type CanvasTool = "select" | "pan" | "comment";
export type Panel = "left" | "right" | "bottom";
export type Panels = Record<Panel, boolean>;

const PANELS_KEY = "composer.panels";
const savedPanels = (): Panels => {
  try {
    return { left: true, right: true, bottom: true, ...(JSON.parse(localStorage.getItem(PANELS_KEY) ?? "{}") as Partial<Panels>) };
  } catch {
    return { left: true, right: true, bottom: true };
  }
};

interface UiState {
  focus: boolean;
  inspectorTab: InspectorTab;
  tool: CanvasTool;
  zoom: number;
  settingsOpen: boolean;
  addMenuOpen: boolean;
  bookmarkOpen: boolean;
  compareOpen: boolean;
  paletteOpen: boolean;
  keysOpen: boolean;
  /** Which of the sidebar, inspector and history bar are showing. Remembered between launches. */
  panels: Panels;
  togglePanel: (panel: Panel) => void;
  setPanels: (panels: Partial<Panels>) => void;
  toggleAllPanels: () => void;
  toggleFocus: () => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setTool: (tool: CanvasTool) => void;
  setZoom: (zoom: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setAddMenuOpen: (open: boolean) => void;
  setBookmarkOpen: (open: boolean) => void;
  setCompareOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setKeysOpen: (open: boolean) => void;
}

/** View state only. Project data lives in the project store. */
export const useUi = create<UiState>((set) => ({
  focus: true,
  inspectorTab: "preview",
  tool: "select",
  zoom: 1,
  settingsOpen: false,
  addMenuOpen: false,
  bookmarkOpen: false,
  compareOpen: false,
  paletteOpen: false,
  keysOpen: false,
  panels: savedPanels(),
  togglePanel: (panel) => set((s) => persistPanels({ ...s.panels, [panel]: !s.panels[panel] })),
  setPanels: (panels) => set((s) => persistPanels({ ...s.panels, ...panels })),
  // Like Figma's ⌘\: anything open closes everything; otherwise everything opens.
  toggleAllPanels: () => set((s) => {
    const anyOpen = s.panels.left || s.panels.right || s.panels.bottom;
    return persistPanels({ left: !anyOpen, right: !anyOpen, bottom: !anyOpen });
  }),
  toggleFocus: () => set((s) => ({ focus: !s.focus })),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => set({ zoom }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setAddMenuOpen: (addMenuOpen) => set({ addMenuOpen }),
  setBookmarkOpen: (bookmarkOpen) => set({ bookmarkOpen }),
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setKeysOpen: (keysOpen) => set({ keysOpen }),
}));

function persistPanels(panels: Panels): { panels: Panels } {
  localStorage.setItem(PANELS_KEY, JSON.stringify(panels));
  return { panels };
}
