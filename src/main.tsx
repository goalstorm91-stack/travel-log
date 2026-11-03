import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import "./utils/pwa"; // start listening for the install prompt before anything renders

// A data router (rather than <HashRouter>) is what lets forms warn before leaving with
// unsaved changes; App still declares every page in its own <Routes>.
const router = createHashRouter([{ path: "*", element: <App /> }]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
