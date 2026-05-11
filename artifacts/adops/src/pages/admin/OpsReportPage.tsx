import { useState, useMemo } from "react";
import { useListDailyStats, useListTeams } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { QuickDateFilter, type DateRange } from "@/components/shared/QuickDateFilter";
import { TrendingUp } from "lucide-react";
import { BizBadge, BizMetrics } from "@/components/shared/BizDisplay";

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

const PAGE_SIZE = 30;

export default function OpsReportPage() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [teamFilter, setTeamFilter] = useState("all");
  const [page, setPage] = useState(1);

  const apiParams: Record<string, string> = {};
  if (dateRange.from) apiParams.dateFrom = dateRange.from;
  if (dateRange.to) apiParams.dateTo = dateRange.to;

  const { data: statsData, isLoading } = useListDailyStats(apiParams);
  const { data: teamsData } = useListTeams({});

  const allStats = useMemo(() => Array.isArray(statsData) ? (statsData as DailyStat[]) : [], [statsData]);
  const teams = useMemo(() => Array.isArray(teamsData) ? (teamsData as Team[]) : [], [teamsData]);
  const liveChatTeams = teams.filter((t) => t.businessType === "liveChat");

  const hasOps = allStats.some((s) => s.businessType != null);

  const filtered = useMemo(() => {
    let rows = allStats.filter((s) => s.businessType != null);
    if (teamFilter !== "all") rows = rows.filter((s) => String(s.teamId) === teamFilter);
    return [...rows].sort((a, b) => b.date.localeCompare(a.date));
  }, [allStats, teamFilter]);

  const paged = usePagination(filtered, PAGE_SIZE, page);

  const liveChatRows = filtered.filter((s) => s.businessType === "liveChat");
  const ecomRows = filtered.filter((s) => s.businessType === "ecommerce");
  const totalSpend = filtered.reduce((s, r) => s + Number(r.spendAmount), 0);
  const totalFans = liveChatRows.reduce((s, r) => s + (r.fanCount ?? 0), 0);
  const avgFanCost = totalFans > 0 ? liveChatRows.reduce((s, r) => s + Number(r.spendAmount), 0) / totalFans : 0;
  const totalGmv = ecomRows.reduce((s, r) => s + Number(r.gmv ?? 0), 0);
  const totalOrders = ecomRows.reduce((s, r) => s + (r.orderCount ?? 0), 0);
  const ecomSpend = ecomRows.reduce((s, r) => s + Number(r.spendAmount), 0);
  const overallRoas = ecomSpend > 0 && totalGmv > 0 ? totalGmv / ecomSpend : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">运营报表</h1>
        <p className="text-sm text-muted-foreground mt-0.5">聊单和独立站投放数据汇总</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {liveChatTeams.length > 0 && (
          <Select value={teamFilter} onValueChange={(v) => { setTeamFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="全部团队" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部团队</SelectItem>
              {liveChatTeams.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto">
          <QuickDateFilter onChange={(r) => { setDateRange(r); setPage(1); }} />
        </div>
      </div>

      <StatsBar items={[
        { label: "记录条数", value: filtered.length },
        { label: "总消耗", value: `$${totalSpend.toFixed(2)}`, color: "blue" },
        ...(liveChatRows.length > 0 ? [
          { label: "聊单进粉", value: totalFans, color: "purple" as const },
          { label: "平均粉成本", value: totalFans > 0 ? `$${avgFanCost.toFixed(4)}` : "—", color: "amber" as const },
        ] : []),
        ...(ecomRows.length > 0 ? [
          { label: "独立站 GMV", value: `$${totalGmv.toFixed(2)}`, color: "green" as const },
          { label: "总订单", value: totalOrders },
          { label: "ROAS", value: overallRoas > 0 ? overallRoas.toFixed(2) : "—", color: "green" as const },
        ] : []),
      ]} />

      {(() => {
        const hasLive = filtered.some((s) => s.businessType === "liveChat");
        const hasEcom = filtered.some((s) => s.businessType === "ecommerce");
        const showBizCol = hasLive && hasEcom;
        const showLive = hasLive;
        const showEcom = hasEcom;
        const colCount = 3 + (showBizCol ? 1 : 0) + 1 + (showLive ? 3 : 0) + (showEcom ? 4 : 0);
        return (
          <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[86px] whitespace-nowrap">日期</TableHead>
                  <TableHead className="w-[120px]">账户</TableHead>
                  <TableHead className="w-[80px]">投手</TableHead>
                  {showBizCol && <TableHead className="w-[56px]">业务</TableHead>}
                  <TableHead className="w-[80px] text-right">消耗</TableHead>
                  {showLive && <TableHead className="w-[68px]">团队</TableHead>}
                  {showLive && <TableHead className="w-[54px] text-right">进粉</TableHead>}
                  {showLive && <TableHead className="w-[78px] text-right">粉成本</TableHead>}
                  {showEcom && <TableHead className="w-[86px] text-right">GMV</TableHead>}
                  {showEcom && <TableHead className="w-[58px] text-right">ROAS</TableHead>}
                  {showEcom && <TableHead className="w-[50px] text-right">订单</TableHead>}
                  {showEcom && <TableHead className="w-[78px] text-right">客单</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: colCount }).map((__, j) => (
                    <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-full" /></TableCell>
                  ))}</TableRow>
                ))}
                {!isLoading && !hasOps && (
                  <TableRow>
                    <TableCell colSpan={colCount}>
                      <EmptyState icon={TrendingUp} title="暂无运营数据" description="投手填报含业务类型的消耗数据后将在此展示。" />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && hasOps && paged.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={colCount}>
                      <EmptyState icon={TrendingUp} title="暂无符合条件的数据" description="调整筛选条件后重试。" />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && paged.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{s.date}</TableCell>
                    <TableCell className="max-w-[120px]">
                      <TruncatedCell value={s.accountName ?? `#${s.accountId}`} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[80px]">
                      <TruncatedCell value={s.pitcherName ?? "—"} />
                    </TableCell>
                    {showBizCol && <TableCell><BizBadge biz={s.businessType} /></TableCell>}
                    <TableCell className="text-right font-mono font-semibold whitespace-nowrap text-sm">${Number(s.spendAmount).toFixed(2)}</TableCell>
                    {showLive && (
                      <TableCell className="text-xs text-muted-foreground max-w-[68px]">
                        <TruncatedCell value={s.teamName ?? "—"} />
                      </TableCell>
                    )}
                    {showLive && (
                      <TableCell className="text-right font-mono text-xs">{s.fanCount ?? "—"}</TableCell>
                    )}
                    {showLive && (
                      <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                        {s.fanCost ? `$${Number(s.fanCost).toFixed(2)}` : "—"}
                      </TableCell>
                    )}
                    {showEcom && (
                      <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                        {s.gmv ? `$${Number(s.gmv).toFixed(2)}` : "—"}
                      </TableCell>
                    )}
                    {showEcom && (
                      <TableCell className="text-right font-mono text-xs">{s.roas ? Number(s.roas).toFixed(2) : "—"}</TableCell>
                    )}
                    {showEcom && (
                      <TableCell className="text-right font-mono text-xs">{s.orderCount ?? "—"}</TableCell>
                    )}
                    {showEcom && (
                      <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                        {s.avgOrderValue ? `$${Number(s.avgOrderValue).toFixed(2)}` : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
          </div>
        );
      })()}
    </div>
  );
}
