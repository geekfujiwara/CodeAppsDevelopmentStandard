import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "@/hooks/use-theme";
import { SITE_TITLE, THEME_STORAGE_KEY } from "@/config";
import "./index.css";

document.title = SITE_TITLE;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="light" storageKey={THEME_STORAGE_KEY}>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
