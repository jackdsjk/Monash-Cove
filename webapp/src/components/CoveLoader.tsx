interface CoveLoaderProps {
  label?: string;
  compact?: boolean;
}

export default function CoveLoader({ label = "正在刷新本地数据", compact = false }: CoveLoaderProps) {
  return (
    <div className={`cove-loader ${compact ? "cove-loader--compact" : ""}`} role="status" aria-live="polite">
      <div className="cove-loader-orb" aria-hidden="true">
        <span className="cove-loader-ring cove-loader-ring--outer" />
        <span className="cove-loader-ring cove-loader-ring--inner" />
        <span className="cove-loader-core" />
      </div>
      <div className="cove-loader-word" aria-hidden="true">
        cove<span>.</span>
      </div>
      <p className="cove-loader-label">{label}</p>
      {!compact ? <div className="cove-loader-bars" aria-hidden="true"><span /><span /><span /></div> : null}
    </div>
  );
}
