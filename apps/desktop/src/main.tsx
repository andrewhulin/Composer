import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import { AppShell } from "./ui/shell/AppShell";
import { boot } from "./app/boot";
import { useSession } from "./store/session";
import { actions, loadProject, useProject } from "./store/project";

boot()
  .then(async (booted) => {
    useSession.setState({ status: "ready", booted });
    await loadProject(booted);
  })
  .catch((e: unknown) => useSession.setState({ status: "error", message: e instanceof Error ? e.message : String(e) }));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);

// Dev builds expose the store for scripted UI checks from the console.
if (import.meta.env.DEV) Object.assign(window, { __composer: { actions, useProject } });
