import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "@/hooks/use-theme";
import { SITE_NAME } from "@/config";
import "./index.css";

document.title = SITE_NAME;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="light" storageKey="pp-theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
