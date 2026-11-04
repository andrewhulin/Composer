import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import { AppShell } from "./ui/shell/AppShell";
import { boot } from "./app/boot";
import { useSession } from "./store/session";

boot().then(
  (booted) => useSession.setState({ status: "ready", booted }),
  (e: unknown) => useSession.setState({ status: "error", message: e instanceof Error ? e.message : String(e) }),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
