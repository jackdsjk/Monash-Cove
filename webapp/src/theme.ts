import type { ThemeConfig } from "antd";

export const coveTheme: ThemeConfig = {
  token: {
    colorPrimary: "#1F5A46",
    colorPrimaryHover: "#2B6B54",
    colorInfo: "#0958D9",
    colorError: "#CF1322",
    colorWarning: "#D48806",
    colorSuccess: "#389E0D",
    colorBgLayout: "#F5F5F5",
    colorBgContainer: "#FFFFFF",
    colorText: "rgba(0, 0, 0, 0.88)",
    colorTextSecondary: "rgba(0, 0, 0, 0.65)",
    colorTextTertiary: "rgba(0, 0, 0, 0.55)",
    colorTextDescription: "rgba(0, 0, 0, 0.66)",
    colorBorder: "#D9D9D9",
    colorBorderSecondary: "#F0F0F0",
    borderRadius: 6,
    fontSize: 14,
    controlHeight: 32,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  components: {
    Layout: {
      bodyBg: "#F5F5F5",
      siderBg: "#FFFFFF",
      headerBg: "#FFFFFF",
    },
    Menu: {
      itemSelectedBg: "#E8F1EC",
      itemSelectedColor: "#1F5A46",
    },
  },
};
