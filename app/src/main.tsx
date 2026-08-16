import React from "react";
import { createRoot } from "react-dom/client";
// JetBrains Mono SELF-HOSTED (@fontsource/jetbrains-mono — already the
// workspace's pinned dep, mirrored from cell 4): no Google Fonts request ever
// leaves the shell (the mock's <link> was a prototype convenience only).
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles.css";
import App from "./App";

// Integrate-stage harness seam: `?hub=http://127.0.0.1:PORT` points the shell
// at an EPHEMERAL hub (acceptance/browser checks must never squat the live
// demo stack's fixed ports). No param → the documented dev default (8477).
// The LSP socket still self-discovers via that hub's /health.lsp.url.
// Green-flow round (additive, same rationale): `?ai=http://127.0.0.1:PORT`
// points the AI panel at an EPHEMERAL ai-server the same way — the browser
// spot check runs its own hub+ai pair per page while a live stack owns the
// fixed ports. No param → the documented dev default (8478).
const params = new URLSearchParams(window.location.search);
const hubOverride = params.get("hub");
const aiOverride = params.get("ai");

createRoot(document.getElementById("root")!).render(
  <App hubBase={hubOverride ?? undefined} aiBase={aiOverride ?? undefined} />,
);
