/** True inside the Tauri app; false in `pnpm web` (plain browser, for fast UI iteration). */
export const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
