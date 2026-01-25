/**
 * React entry point for BunBase Admin UI.
 * Renders the App component with global Toaster for notifications.
 */

import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import App from "./App";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

const root = createRoot(container);
root.render(
  <>
    <App />
    <Toaster position="bottom-right" />
  </>
);
