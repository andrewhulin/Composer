import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import { AppShell } from "./ui/shell/AppShell";
import { boot } from "./app/boot";
import { useSession } from "./store/session";
import { actions, loadProject, useProject } from "./store/project";
import { storyProps } from "./share/story";
import * as craft from "./store/craft";
import { loadCraft } from "./store/craft";
import { loadComments } from "./store/comments";
import { initTutorial, tutorial as tutorialApi, useTutorial } from "./tutorial/store";
import { flushRequests } from "./requests/store";
import { startUpdateChecks, updates } from "./store/updates";

boot()
  .then(async (booted) => {
    useSession.setState({ status: "ready", booted });
    await loadProject(booted);
    await loadCraft();
    await loadComments();
    await initTutorial();
    // Requests saved offline or before Notion was connected go out at launch.
    void flushRequests().catch(() => undefined);
  })
  .catch((e: unknown) => useSession.setState({ status: "error", message: e instanceof Error ? e.message : String(e) }));

startUpdateChecks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);

// Dev builds expose the store for scripted UI checks from the console.
if (import.meta.env.DEV) Object.assign(window, { __composer: { actions, useProject, storyProps, craft, tutorial: { ...tutorialApi, useTutorial }, updates } });
