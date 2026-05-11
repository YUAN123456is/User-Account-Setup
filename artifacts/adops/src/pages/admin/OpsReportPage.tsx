import { useState, useMemo } from "react";
import { useListDailyStats, useListTeams } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateRangePicker, type DateRange } from "@/components/shared/DateRangePicker";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { TrendingUp } from "lucide-react";

interface DailyStat {
  id: number;
  accountId: number;
  accountName?: string | null;
  date: string;
  spendAmount: string | number;
  pitcherName?: string | null;
  businessType?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  fanCount?: number | null;
  fanCost?: string | null;
  gmv?: string | null;
  orderCount?: number | null;
  roas?: string | null;
  avgOrderValue?: string | null;
}

interface Team { id: number; name: string; businessType: string; }

const BIZ_LABELS: Record<string, string> = { liveChat: "聊单", ecommerce: "独立站" };
const PAGE_SIZE = 30;

export default function OpsReportPage() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [bizFilter, setBizFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [page, setPage] = useState(1);

  const apiParams: Record<string, string> = {};
  if (dateRange.from) apiParams.dateFrom = dateRange.from;
  if (dateRange.to) apiParams.dateTo = dateRange.to;

  const { data: statsData, isLoading } = useListDailyStats(apiParams);
  const { data: teamsData } = useListTeams({});

  const allStats = useMemo(() => Array.isArray(statsData) ? (statsData as DailyStat[]) : [], [statsData]);
  const teams = useMemo(() => Array.isArray(teamsData) ? (teamsData as Team[]) : [], [teamsData]);

  const hasOps = allStats.some((s) => s.businessType != null);

  const filtered = useMemo(() => {
    let rows = allStats.filter((s) => s.businessType != null);
    if (bizFilter !== "all") rows = rows.filter((s) => s.businessType === bizFilter);
    if (teamFilter !== "all") rows = rows.filter((s) => String(s.teamId) === teamFilter);
    return [...rows].sort((a, b) => b.date.localeCompare(a.date));
  }, [allStats, bizFilter, teamFilter]);

  const paged = usePagination(filtered, PAGE_SIZE, page);

  const liveChatRows = filtered.filter((s) => s.businessType === "liveChat");
  const ecomRows = filtered.filter((s) => s.businessType === "ecommerce");
  const totalSpend = filtered.reduce((s, r) => s + Number(r.spendAmount), 0);
  const totalFans = liveChatRows.reduce((s, r) => s + (r.fanCount ?? 0), 0);
  const avgFanCost = totalFans > 0 ? liveChatRows.reduce((s, r) => s + Number(r.spendAmount), 0) / totalFans : 0;
  const totalGmv = ecomRows.reduce((s, r) => s + Number(r.gmv ?? 0), 0);
  const totalOrders = ecomRows.reduce((s, r) => s + (r.orderCount ?? 0), 0);
  const overallRoas = totalSpend > 0 && totalGmv > 0 ? totalGmv / ecomRows.reduce((s, r) => s + Number(r.spendAmount), 0) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">运营报表</h1>
        <p className="text-sm text-muted-foreground mt-0.5">聊单和独立站投放数据汇总</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center rounded-md border border-border overflow-hidden h-8">
          {[{ value: "all", label: "全部业务" }, { value: "liveChat", label: "聊单" }, { value: "ecommerce", label: "独立站" }].map((opt) => (
            <button key={opt.value} onClick={() => { setBizFilter(opt.value); setPage(1); }}
              className={["px-3 h-full text-xs font-medium transition-colors border-r border-border last:border-r-0",
                bizFilter === opt.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"].join(" ")}>
              {opt.label}
            </button>
          ))}
        </div>

        {(bizFilter === "all" || bizFilter === "liveChat") && teams.filter((t) => t.businessType === "liveChat").length > 0 && (
          <select value={teamFilter} onChange={(e) => { setTeamFilter(e.target.value); setPage(1); }}
            className="h-8 text-xs border border-border rounded-md px-2 bg-background text-foreground">
            <option value="all">全部团队</option>
            {teams.filter((t) => t.businessType === "liveChat").map((t) => (
              <option key={t.id} value={String(t.id)}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">统计时间范围</p>
        <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r); setPage(1); }} />
      </div>

      <StatsBar items={[
        { label: "记录条数", value: filtered.length },
        { label: "总消耗", value: `$${totalSpend.toFixed(2)}`, color: "blue" },
        ...(liveChatRows.length > 0 ? [
          { label: "聊单总进粉", value: totalFans, color: "purple" as const },
          { label: "平均粉丝成本", value: totalFans > 0 ? `$${avgFanCost.toFixed(4)}` : "—", color: "amber" as const },
        ] : []),
        ...(ecomRows.length > 0 ? [
          { label: "独立站 GMV", value: `$${totalGmv.toFixed(2)}`, color: "green" as const },
          { label: "总订单数", value: totalOrders },
          { label: "ROAS", value: overallRoas > 0 ? overallRoas.toFixed(2) : "—", color: "green" as const },
        ] : []),
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>日期</TableHead>
              <TableHead>账户</TableHead>
              <TableHead>投手</TableHead>
              <TableHead>业务</TableHead>
              <TableHead>团队</TableHead>
              <TableHead>消耗</TableHead>
              <TableHead>运营数据</TableHead>
              <TableHead>核心指标</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-16" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && !hasOps && (
              <TableRow>
                <TableCell colSpan={8}>
                  <EmptyState icon={TrendingUp} title="暂无运营数据" description="投手填报含业务类型的消耗数据后将在此展示。" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && hasOps && paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <EmptyState icon={TrendingUp} title="暂无符合条件的数据" description="调整筛选条件后重试。" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && paged.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">{s.date}</TableCell>
                <TableCell className="max-w-[140px] text-sm font-medium">
                  <TruncatedCell value={s.accountName ?? `#${s.accountId}`} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.pitcherName ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={s.businessType === "liveChat"
                    ? "text-purple-400 border-purple-500/30 bg-purple-500/10"
                    : "text-blue-400 border-blue-500/30 bg-blue-500/10"}>
                    {BIZ_LABELS[s.businessType ?? ""] ?? s.businessType}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.teamName ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm font-semibold">${Number(s.spendAmount).toFixed(2)}</TableCell>
                <TableCell className="text-xs">
                  {s.businessType === "liveChat" ? (
                    s.fanCount != null ? <span>进粉 <span className="font-mono font-medium">{s.fanCount}</span></span> : <span className="text-muted-foreground">—</span>
                  ) : s.businessType === "ecommerce" ? (
                    s.gmv != null ? (
                      <span>GMV <span className="font-mono font-medium">${Number(s.gmv).toFixed(0)}</span>
                        {s.orderCount != null && <span className="text-muted-foreground"> · {s.orderCount} 单</span>}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-xs">
                  {s.businessType === "liveChat" && s.fanCost ? (
                    <span className="text-green-500 font-mono">${Number(s.fanCost).toFixed(4)}/粉</span>
                  ) : s.businessType === "ecommerce" && s.roas ? (
                    <span>
                      <span className="text-green-500 font-mono">ROAS {Number(s.roas).toFixed(2)}</span>
                      {s.avgOrderValue && <span className="text-muted-foreground"> · 客单 ${Number(s.avgOrderValue).toFixed(0)}</span>}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
