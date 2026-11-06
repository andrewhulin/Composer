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
import { loadRouter, useRouter } from "./store/router";
import { loadSkills } from "./store/skills";
import { loadComments } from "./store/comments";
import { initTutorial, tutorial as tutorialApi, useTutorial } from "./tutorial/store";
import { flushRequests } from "./requests/store";
import { startUpdateChecks, updates } from "./store/updates";

// Dev only: ?gallery shows the design system instead of the app. The branch drops out of release builds.
const gallery = import.meta.env.DEV && new URLSearchParams(location.search).has("gallery");

if (gallery) {
  void import("./ui/gallery/Gallery").then(({ Gallery }) =>
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <Gallery />
      </StrictMode>,
    ),
  );
} else {
  boot()
    .then(async (booted) => {
      useSession.setState({ status: "ready", booted });
      await loadProject(booted);
      await loadCraft();
      await loadSkills();
      await loadRouter();
      await loadComments();
      await initTutorial();
      // Check the connectors this project needs, so the title bar can flag a missing or broken one.
    void import("./store/connections").then((c) => c.checkAll(c.requiredNow()));
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
}

// Dev builds expose the store for scripted UI checks from the console.
if (import.meta.env.DEV) void import("./store/skills").then((skills) => Object.assign(window, { __composer: { actions, useProject, storyProps, craft, skills, router: useRouter, tutorial: { ...tutorialApi, useTutorial }, updates } }));
