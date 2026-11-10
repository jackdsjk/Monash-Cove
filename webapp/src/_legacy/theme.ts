import type { ThemeConfig } from "antd";

export const coveTheme: ThemeConfig = {
  token: {
    colorPrimary: "#2568B3",
    colorPrimaryHover: "#1D5A9E",
    colorInfo: "#2F7FD1",
    colorError: "#CF1322",
    colorWarning: "#A8630A",
    colorSuccess: "#177B8A",
    colorBgLayout: "#F4F9FD",
    colorBgContainer: "#FFFFFF",
    colorText: "#13212C",
    colorTextSecondary: "#3D5364",
    colorTextTertiary: "#5C7182",
    colorTextDescription: "#5C7182",
    colorBorder: "#CDDEEB",
    colorBorderSecondary: "#E3ECF3",
    borderRadius: 8,
    fontSize: 14,
    controlHeight: 34,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  components: {
    Layout: {
      bodyBg: "#F4F9FD",
      siderBg: "#FFFFFF",
      headerBg: "#FFFFFF",
    },
    Menu: {
      itemSelectedBg: "#E4F0FB",
      itemSelectedColor: "#1F5FA8",
    },
  },
};
