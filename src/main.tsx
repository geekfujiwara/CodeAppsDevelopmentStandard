import React from "react";
import ReactDOM from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { PowerProvider } from "./PowerProvider";
import App from "./App";

/**
 * アプリケーションのエントリーポイント
 *
 * PowerProvider: Power Platform SDK の初期化を管理
 * FluentProvider: Fluent UI のテーマとスタイルを提供
 */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PowerProvider>
      <FluentProvider theme={webLightTheme}>
        <App />
      </FluentProvider>
    </PowerProvider>
  </React.StrictMode>
);
