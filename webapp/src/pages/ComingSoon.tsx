import { Panel } from "../components/ui";

/** 迁移期间的占位页：不造假数据，明确说明这一页还没接上真实数据。 */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <header className="mb-7">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1.5 text-[15px] text-slate-600">{description}</p>
      </header>
      <Panel className="p-8 text-center">
        <p className="text-sm text-slate-500">这一页的界面正在迁移，数据接口尚未接回。迁移完成后这里会显示真实内容。</p>
      </Panel>
    </div>
  );
}
