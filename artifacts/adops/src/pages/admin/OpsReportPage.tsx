import { useState, useMemo } from "react";
import { useListDailyStats, useListTeams } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { QuickDateFilter, type DateRange } from "@/components/shared/QuickDateFilter";
import { TrendingUp, Search, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { BizBadge } from "@/components/shared/BizDisplay";

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
  const [pitcherFilter, setPitcherFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };

  const apiParams: Record<string, string> = {};
  if (dateRange.from) apiParams.dateFrom = dateRange.from;
  if (dateRange.to) apiParams.dateTo = dateRange.to;

  const { data: statsData, isLoading } = useListDailyStats(apiParams);
  const { data: teamsData } = useListTeams({});

  const allStats = useMemo(() => Array.isArray(statsData) ? (statsData as DailyStat[]) : [], [statsData]);
  const teams = useMemo(() => Array.isArray(teamsData) ? (teamsData as Team[]) : [], [teamsData]);
  const liveChatTeams = teams.filter((t) => t.businessType === "liveChat");
  const pitcherNames = useMemo(() => {
    const names = new Set<string>();
    allStats.forEach((s) => { if (s.pitcherName) names.add(s.pitcherName); });
    return Array.from(names).sort();
  }, [allStats]);

  const hasOps = allStats.some((s) => s.businessType != null);

  const filtered = useMemo(() => {
    let rows = allStats.filter((s) => s.businessType != null);
    if (teamFilter !== "all") rows = rows.filter((s) => String(s.teamId) === teamFilter);
    if (pitcherFilter !== "all") rows = rows.filter((s) => s.pitcherName === pitcherFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((s) => (s.accountName ?? "").toLowerCase().includes(q));
    }
    return rows;
  }, [allStats, teamFilter, pitcherFilter, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "spendAmount" || sortKey === "fanCount" || sortKey === "gmv" || sortKey === "orderCount" || sortKey === "roas") {
        const va = Number((a as unknown as Record<string, unknown>)[sortKey] ?? 0);
        const vb = Number((b as unknown as Record<string, unknown>)[sortKey] ?? 0);
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const sa = String((a as unknown as Record<string, unknown>)[sortKey] ?? "");
      const sb = String((b as unknown as Record<string, unknown>)[sortKey] ?? "");
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }, [filtered, sortKey, sortDir]);

  const paged = usePagination(sorted, PAGE_SIZE, page);

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
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 w-48 text-sm" placeholder="搜索账户名称..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>

        {pitcherNames.length > 0 && (
          <Select value={pitcherFilter} onValueChange={(v) => { setPitcherFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="全部投手" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部投手</SelectItem>
              {pitcherNames.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

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

        {(search || pitcherFilter !== "all" || teamFilter !== "all") && (
          <button
            onClick={() => { setSearch(""); setPitcherFilter("all"); setTeamFilter("all"); setPage(1); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            清除筛选
          </button>
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
        const SortHead = ({ col, label, className, right }: { col: string; label: string; className?: string; right?: boolean }) => {
          const icon = sortKey === col
            ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />)
            : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-25" />;
          return (
            <TableHead
              className={`cursor-pointer select-none whitespace-nowrap hover:bg-muted/60 transition-colors ${className ?? ""}`}
              onClick={() => handleSort(col)}
            >
              <span className={`inline-flex items-center gap-1${right ? " w-full justify-end" : ""}`}>
                {right && icon}
                {label}
                {!right && icon}
              </span>
            </TableHead>
          );
        };
        return (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <SortHead col="date" label="日期" className="w-[86px]" />
                  <SortHead col="accountName" label="账户" className="w-[120px]" />
                  <SortHead col="pitcherName" label="投手" className="w-[80px]" />
                  {showBizCol && <TableHead className="w-[56px]">业务</TableHead>}
                  <SortHead col="spendAmount" label="消耗" className="w-[80px] text-right" right />
                  {showLive && <TableHead className="w-[68px]">团队</TableHead>}
                  {showLive && <SortHead col="fanCount" label="进粉" className="w-[54px] text-right" right />}
                  {showLive && <TableHead className="w-[78px] text-right">粉成本</TableHead>}
                  {showEcom && <SortHead col="gmv" label="GMV" className="w-[86px] text-right" right />}
                  {showEcom && <SortHead col="roas" label="ROAS" className="w-[58px] text-right" right />}
                  {showEcom && <SortHead col="orderCount" label="订单" className="w-[50px] text-right" right />}
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
