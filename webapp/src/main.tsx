import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { DemoProvider } from "./state/DemoStateContext";
import { coveTheme } from "./theme";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={coveTheme}>
      <AntApp>
        <DemoProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </DemoProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
