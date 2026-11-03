import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import "./utils/pwa"; // start listening for the install prompt before anything renders
import { pruneOrphanThumbs } from "./utils/thumbs";

// A data router (rather than <HashRouter>) is what lets forms warn before leaving with
// unsaved changes; App still declares every page in its own <Routes>.
const router = createHashRouter([{ path: "*", element: <App /> }]);

// Photos get deleted from several places; sweep up their leftover thumbnails once the app is idle.
const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2000));
idle(() => void pruneOrphanThumbs().catch(() => undefined));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
