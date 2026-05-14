import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./app/globals.css";
// Register all tools at startup
import "./lib/tools/index";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
