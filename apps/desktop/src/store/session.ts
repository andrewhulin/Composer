import { create } from "zustand";
import type { Booted } from "../app/boot";

type SessionState = { status: "booting" } | { status: "ready"; booted: Booted } | { status: "error"; message: string };

export const useSession = create<SessionState>(() => ({ status: "booting" }));
