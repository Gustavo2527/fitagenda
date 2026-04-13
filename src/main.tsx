import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Guard: don't register SW in iframe/preview contexts
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
} else if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").then((reg) => {
      console.log("SW registered:", reg.scope);
    }).catch((err) => {
      console.error("SW registration failed:", err);
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
