interface StatRow {
  businessType?: string | null;
  teamName?: string | null;
  fanCount?: number | null;
  fanCost?: string | null;
  gmv?: string | null;
  orderCount?: number | null;
  roas?: string | null;
  avgOrderValue?: string | null;
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </span>
  );
}

export function BizBadge({ biz, team }: { biz?: string | null; team?: string | null }) {
  if (!biz) return <span className="text-muted-foreground text-xs">—</span>;
  if (biz === "liveChat") {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center text-xs font-medium text-sky-600 bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 rounded w-fit">聊单</span>
        {team && <span className="text-xs text-muted-foreground truncate max-w-[80px]">{team}</span>}
      </div>
    );
  }
  return <span className="inline-flex items-center text-xs font-medium text-violet-600 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded w-fit">独立站</span>;
}

export function BizMetrics({ s }: { s: StatRow }) {
  if (s.businessType === "liveChat") {
    return (
      <div className="flex items-center gap-2.5 flex-wrap">
        <MetricItem label="进粉" value={s.fanCount != null ? String(s.fanCount) : "—"} />
        <MetricItem label="粉成本" value={s.fanCost ? `$${s.fanCost}` : "—"} />
      </div>
    );
  }
  if (s.businessType === "ecommerce") {
    return (
      <div className="flex items-center gap-2.5 flex-wrap">
        <MetricItem label="GMV" value={s.gmv ? `$${Number(s.gmv).toFixed(2)}` : "—"} />
        <MetricItem label="ROAS" value={s.roas ?? "—"} />
        <MetricItem label="订单" value={s.orderCount != null ? String(s.orderCount) : "—"} />
        <MetricItem label="客单" value={s.avgOrderValue ? `$${s.avgOrderValue}` : "—"} />
      </div>
    );
  }
  return <span className="text-muted-foreground text-xs">—</span>;
}
