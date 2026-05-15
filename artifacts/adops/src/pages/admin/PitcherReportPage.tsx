import { useState, useMemo, Fragment } from "react";
import { useGetSpendByPitcher, useGetPitcherAccounts, useListDailyStats } from "@workspace/api-client-react";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { QuickDateFilter, type DateRange } from "@/components/shared/QuickDateFilter";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { AccountStatusBadge, PlatformBadge } from "@/components/shared/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, ChevronDown, ChevronRight, Loader2, History, Search, ChevronsUpDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { BizBadge } from "@/components/shared/BizDisplay";

interface PitcherSpend {
  pitcherId: number;
  pitcherName: string;
  yesterdaySpend: string | number;
  totalSpend: string | number;
  totalRecharge: string | number;
  yesterdayRecharge: string | number;
  totalBalance: string | number;
  accountCount: number;
}

interface PitcherAccountDetail {
  accountId: number;
  accountName: string;
  platformAccountId: string;
  platform: string;
  status: string;
  currentBalance: string | number;
  yesterdaySpend: string | number;
  totalSpend: string | number;
}

const PAGE_SIZE = 20;

interface SelectedAccount {
  accountId: number;
  accountName: string;
  platformAccountId: string;
}

function AccountHistoryDialog({
  account,
  onClose,
}: {
  account: SelectedAccount | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useListDailyStats(
    account ? { accountId: account.accountId } : undefined,
  );

  const allRows = Array.isArray(data) ? (data as Array<typeof data extends (infer T)[] ? T : never>) : [];
  // Each record is now unique per (accountId, date) — no deduplication needed
  const rows = [...allRows].sort((a, b) => b.date.localeCompare(a.date));
  const totalSpend = rows.reduce((s, r) => s + Number(r.spendAmount), 0);

  return (
    <Dialog open={!!account} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            历史消耗记录
          </DialogTitle>
          {account && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {account.accountName}
              {account.platformAccountId && (
                <span className="ml-2 font-mono opacity-70">({account.platformAccountId})</span>
              )}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : isError ? (
            <div className="text-center text-sm text-destructive py-10">加载失败，请稍后重试</div>
          ) : rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">该账户暂无消耗记录</div>
          ) : (
            (() => {
              type R = typeof rows[number] & { businessType?: string | null; teamBreakdowns?: { teamId: number; teamName: string; fanCount: number | null }[] | null; fanCount?: number | null; fanCost?: string | null; gmv?: string | null; roas?: string | null; orderCount?: number | null; avgOrderValue?: string | null; };
              const rs = rows as R[];
              const hasLive = rs.some((r) => r.businessType === "liveChat");
              const hasEcom = rs.some((r) => r.businessType === "ecommerce");
              const showBizCol = hasLive && hasEcom;
              return (
                <>
                  <div className="flex items-center gap-4 mb-3 px-1 text-xs text-muted-foreground">
                    <span>共 <span className="font-semibold text-foreground">{rows.length}</span> 条记录</span>
                    <span>累计消耗 <span className="font-semibold text-primary">${totalSpend.toFixed(2)}</span></span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-max min-w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">日期</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">当日消耗</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">余额快照</th>
                          {showBizCol && <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">业务</th>}
                          {hasLive && <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">团队</th>}
                          {hasLive && <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">进粉</th>}
                          {hasLive && <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">粉成本</th>}
                          {hasEcom && <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">GMV</th>}
                          {hasEcom && <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">ROAS</th>}
                          {hasEcom && <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">订单</th>}
                          {hasEcom && <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">客单</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rs.map((r, idx) => (
                          <tr key={r.id} className={cn("border-b border-border/40 last:border-0", idx % 2 === 1 && "bg-muted/20")}>
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.date}</td>
                            <td className="px-3 py-2 font-mono text-right font-semibold text-orange-500 whitespace-nowrap">
                              ${Number(r.spendAmount).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 font-mono text-right text-primary whitespace-nowrap">
                              ${Number(r.realBalance).toFixed(2)}
                            </td>
                            {showBizCol && <td className="px-3 py-2"><BizBadge biz={r.businessType ?? null} /></td>}
                            {hasLive && <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{r.teamBreakdowns && r.teamBreakdowns.length > 0 ? r.teamBreakdowns.map((t) => t.teamName).join("、") : "—"}</td>}
                            {hasLive && <td className="px-3 py-2 font-mono text-right text-xs">{r.fanCount ?? "—"}</td>}
                            {hasLive && <td className="px-3 py-2 font-mono text-right text-xs whitespace-nowrap">{r.fanCost ? `$${Number(r.fanCost).toFixed(2)}` : "—"}</td>}
                            {hasEcom && <td className="px-3 py-2 font-mono text-right text-xs whitespace-nowrap">{r.gmv ? `$${Number(r.gmv).toFixed(2)}` : "—"}</td>}
                            {hasEcom && <td className="px-3 py-2 font-mono text-right text-xs">{r.roas ? Number(r.roas).toFixed(2) : "—"}</td>}
                            {hasEcom && <td className="px-3 py-2 font-mono text-right text-xs">{r.orderCount ?? "—"}</td>}
                            {hasEcom && <td className="px-3 py-2 font-mono text-right text-xs whitespace-nowrap">{r.avgOrderValue ? `$${Number(r.avgOrderValue).toFixed(2)}` : "—"}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountDetailPanel({
  pitcherId,
  dateRange,
  hasFilter,
  onAccountClick,
}: {
  pitcherId: number;
  dateRange: DateRange;
  hasFilter: boolean;
  onAccountClick: (acc: SelectedAccount) => void;
}) {
  const params: Record<string, string | number> = { pitcherId };
  if (dateRange.from) params.dateFrom = dateRange.from;
  if (dateRange.to) params.dateTo = dateRange.to;

  const { data, isLoading, isError } = useGetPitcherAccounts(params as Parameters<typeof useGetPitcherAccounts>[0]);
  const rows = Array.isArray(data) ? (data as PitcherAccountDetail[]) : [];

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={hasFilter ? 6 : 8} className="p-0">
        <div className="mx-4 my-2 rounded-lg border border-primary/20 bg-muted/30 overflow-hidden shadow-sm">
          <div className="px-4 py-2 bg-primary/5 border-b border-primary/20 flex items-center gap-2">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">账户明细</span>
            {!isLoading && !isError && (
              <span className="text-xs text-muted-foreground">（共 {rows.length} 个账户）</span>
            )}
            <span className="text-xs text-muted-foreground ml-auto">点击账户行查看历史消耗</span>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : isError ? (
            <div className="text-center text-sm text-destructive py-5">加载失败，请稍后重试</div>
          ) : rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-5">该投手暂无账户</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">账户名称</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">平台账户ID</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">平台</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">状态</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">当前余额</th>
                  {!hasFilter && <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">昨日消耗</th>}
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">{hasFilter ? "期间消耗" : "累计消耗"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((acc, idx) => (
                  <tr
                    key={acc.accountId}
                    className={cn(
                      "border-b border-border/40 last:border-0 cursor-pointer transition-colors hover:bg-primary/10",
                      idx % 2 === 1 && "bg-muted/20",
                    )}
                    onClick={() => onAccountClick({
                      accountId: acc.accountId,
                      accountName: acc.accountName ?? "",
                      platformAccountId: acc.platformAccountId ?? "",
                    })}
                  >
                    <td className="px-4 py-2 font-medium max-w-[160px]">
                      <div className="flex items-center gap-1.5">
                        <History className="h-3 w-3 text-muted-foreground shrink-0" />
                        <TruncatedCell value={acc.accountName} />
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground max-w-[140px]"><TruncatedCell value={acc.platformAccountId} /></td>
                    <td className="px-4 py-2"><PlatformBadge platform={acc.platform} /></td>
                    <td className="px-4 py-2"><AccountStatusBadge status={acc.status as "idle" | "active" | "banned"} /></td>
                    <td className="px-4 py-2 font-mono font-semibold text-primary text-right whitespace-nowrap">${Number(acc.currentBalance).toFixed(2)}</td>
                    {!hasFilter && <td className="px-4 py-2 font-mono text-right whitespace-nowrap">${Number(acc.yesterdaySpend).toFixed(2)}</td>}
                    <td className="px-4 py-2 font-mono text-right whitespace-nowrap">${Number(acc.totalSpend).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function PitcherReportPage() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("totalSpend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedAccount, setSelectedAccount] = useState<SelectedAccount | null>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };

  const params: Record<string, string> = {};
  if (dateRange.from) params.dateFrom = dateRange.from;
  if (dateRange.to) params.dateTo = dateRange.to;

  const { data, isLoading } = useGetSpendByPitcher(params);
  const rows = Array.isArray(data) ? (data as PitcherSpend[]) : [];

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => r.pitcherName.toLowerCase().includes(q));
  }, [rows, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const numericKeys = ["totalSpend", "totalBalance", "totalRecharge", "accountCount"];
      const numericAltKeys = ["yesterdaySpend", "yesterdayRecharge"];
      if (numericKeys.includes(sortKey) || numericAltKeys.includes(sortKey)) {
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

  const hasFilter = !!(dateRange.from || dateRange.to);
  const totalTodaySpend = filtered.reduce((s, r) => s + Number(r.yesterdaySpend), 0);
  const totalPeriodSpend = filtered.reduce((s, r) => s + Number(r.totalSpend), 0);
  const totalBalance = filtered.reduce((s, r) => s + Number(r.totalBalance), 0);
  const todayRecharge = filtered.reduce((s, r) => s + Number(r.yesterdayRecharge), 0);
  const totalRecharge = filtered.reduce((s, r) => s + Number(r.totalRecharge), 0);
  const totalAccounts = filtered.reduce((s, r) => s + r.accountCount, 0);
  const topPitcher = filtered.length > 0 ? filtered.reduce((best, r) => Number(r.totalSpend) > Number(best.totalSpend) ? r : best) : null;

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 w-44 text-sm" placeholder="搜索投手名称..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {search && (
          <button onClick={() => { setSearch(""); setPage(1); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
            清除
          </button>
        )}
        <div className="ml-auto">
          <QuickDateFilter onChange={(r) => { setDateRange(r); setPage(1); }} />
        </div>
      </div>

      <StatsBar items={[
        { label: "投手数量", value: filtered.length },
        ...(hasFilter ? [
          { label: "期间总消耗", value: `$${totalPeriodSpend.toFixed(2)}`, color: "blue" as const },
        ] : [
          { label: "昨日总消耗", value: `$${totalTodaySpend.toFixed(2)}`, color: "blue" as const },
          { label: "累计总消耗", value: `$${totalPeriodSpend.toFixed(2)}`, color: "purple" as const },
        ]),
        { label: "账户余额合计", value: `$${totalBalance.toFixed(2)}`, color: "green" },
        ...(hasFilter ? [
          { label: "期间充值", value: `$${totalRecharge.toFixed(2)}`, color: "amber" as const },
        ] : [
          { label: "昨日充值到账", value: `$${todayRecharge.toFixed(2)}`, color: "amber" as const },
          { label: "累计充值", value: `$${totalRecharge.toFixed(2)}` },
        ]),
        { label: "账户总数", value: totalAccounts },
        { label: "消耗最高", value: topPitcher ? topPitcher.pitcherName : "—", color: "amber" },
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            {(() => {
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
                <TableRow className="bg-muted/40">
                  <TableHead className="w-8" />
                  <SortHead col="pitcherName" label="投手名称" />
                  {!hasFilter && <SortHead col="yesterdaySpend" label="昨日消耗" className="text-right" right />}
                  <SortHead col="totalSpend" label={hasFilter ? "期间消耗" : "累计消耗"} className="text-right" right />
                  <SortHead col="totalBalance" label="余额合计" className="text-right" right />
                  {!hasFilter && <SortHead col="yesterdayRecharge" label="昨日充值" className="text-right" right />}
                  <SortHead col="totalRecharge" label={hasFilter ? "期间充值" : "累计充值"} className="text-right" right />
                  <SortHead col="accountCount" label="账户数" className="text-right w-16" right />
                </TableRow>
              );
            })()}
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: hasFilter ? 6 : 8 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={hasFilter ? 6 : 8}>
                  <EmptyState icon={BarChart3} title="暂无数据" description="投手上报每日数据后将在此显示。" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && paged.map((r) => {
              const isOpen = expanded.has(r.pitcherId);
              return (
                <Fragment key={r.pitcherId}>
                  <TableRow
                    className={cn("cursor-pointer select-none transition-colors", isOpen && "bg-primary/5 border-l-2 border-l-primary")}
                    onClick={() => toggleExpand(r.pitcherId)}
                  >
                    <TableCell className="w-8 text-primary">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="font-semibold">{r.pitcherName}</TableCell>
                    {!hasFilter && <TableCell className="font-mono text-right whitespace-nowrap">${Number(r.yesterdaySpend).toFixed(2)}</TableCell>}
                    <TableCell className="font-mono text-right whitespace-nowrap">${Number(r.totalSpend).toFixed(2)}</TableCell>
                    <TableCell className="font-mono font-semibold text-primary text-right whitespace-nowrap">${Number(r.totalBalance).toFixed(2)}</TableCell>
                    {!hasFilter && <TableCell className="font-mono text-amber-600 text-right whitespace-nowrap">${Number(r.yesterdayRecharge).toFixed(2)}</TableCell>}
                    <TableCell className="font-mono text-right whitespace-nowrap">${Number(r.totalRecharge).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center justify-center bg-muted text-muted-foreground text-xs rounded-full px-2 py-0.5 min-w-[24px]">
                        {r.accountCount}
                      </span>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <AccountDetailPanel
                      pitcherId={r.pitcherId}
                      dateRange={dateRange}
                      hasFilter={hasFilter}
                      onAccountClick={setSelectedAccount}
                    />
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>

      <AccountHistoryDialog
        account={selectedAccount}
        onClose={() => setSelectedAccount(null)}
      />
    </div>
  );
}
