import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Modal } from "antd";
import { ArrowRightOutlined, CheckSquareOutlined, ClockCircleOutlined, InboxOutlined, SearchOutlined, SettingOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const destinations = [
  { label: "简报", path: "/", icon: <InboxOutlined />, hint: "查看最近更新" },
  { label: "倒计时", path: "/deadlines", icon: <ClockCircleOutlined />, hint: "查看 Moodle 截止时间" },
  { label: "每周资料", path: "/materials", icon: <InboxOutlined />, hint: "按周浏览课程资料" },
  { label: "签到", path: "/attendance", icon: <CheckSquareOutlined />, hint: "查看和填写 attendance code" },
  { label: "数据源", path: "/sources", icon: <SearchOutlined />, hint: "连接 Gmail、Ed、Moodle" },
  { label: "设置", path: "/settings", icon: <SettingOutlined />, hint: "管理本地数据" },
];

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      <button type="button" className="command-trigger" onClick={() => setOpen(true)} aria-label="打开搜索和跳转">
        <SearchOutlined />
        <span>搜索或跳转</span>
        <kbd>⌘K</kbd>
      </button>
      <Modal
        className="command-modal"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        closable={false}
        width={560}
        destroyOnHidden
        styles={{ body: { padding: 0 } }}
      >
        <Command className="command-palette" loop>
          <div className="command-input-wrap">
            <SearchOutlined />
            <Command.Input autoFocus placeholder="跳转到页面…" className="command-input" />
            <kbd>ESC</kbd>
          </div>
          <Command.List className="command-list">
            <Command.Empty className="command-empty">没有匹配的页面</Command.Empty>
            <Command.Group heading="导航" className="command-group">
              {destinations.map((item) => (
                <Command.Item key={item.path} value={`${item.label} ${item.hint}`} className="command-item" onSelect={() => go(item.path)}>
                  <span className="command-item-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  <span className="command-item-hint">{item.hint}</span>
                  <ArrowRightOutlined className="command-item-arrow" />
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
          <div className="command-footer">
            <span>↑↓ 选择</span>
            <span>↵ 打开</span>
            <span>esc 关闭</span>
          </div>
        </Command>
      </Modal>
    </>
  );
}
