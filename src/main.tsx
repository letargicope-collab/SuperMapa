import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// NOTE: "./index.css" (Tailwind) is intentionally NOT imported here.
// The page is a verbatim copy of the original repository site, which ships its
// own complete inline <style> in index.html — importing Tailwind's preflight
// would override some of those original styles.
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
