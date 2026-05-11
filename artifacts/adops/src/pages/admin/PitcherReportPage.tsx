import { useState, Fragment } from "react";
import { useGetSpendByPitcher, useGetPitcherAccounts, useListDailyStats } from "@workspace/api-client-react";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateRangePicker, type DateRange } from "@/components/shared/DateRangePicker";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { AccountStatusBadge, PlatformBadge } from "@/components/shared/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, ChevronDown, ChevronRight, Loader2, History } from "lucide-react";
import { cn } from "@/lib/utils";

interface PitcherSpend {
  pitcherId: number;
  pitcherName: string;
  todaySpend: string | number;
  totalSpend: string | number;
  totalRecharge: string | number;
  todayRecharge: string | number;
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
  todaySpend: string | number;
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

  const rows = Array.isArray(data) ? [...data].sort((a, b) => b.date.localeCompare(a.date)) : [];
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
            <>
              <div className="flex items-center gap-4 mb-3 px-1 text-xs text-muted-foreground">
                <span>共 <span className="font-semibold text-foreground">{rows.length}</span> 条记录</span>
                <span>累计消耗 <span className="font-semibold text-primary">${totalSpend.toFixed(2)}</span></span>
              </div>
              <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">日期</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">当日消耗</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">余额快照</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.id} className={cn("border-b border-border/40 last:border-0", idx % 2 === 1 && "bg-muted/20")}>
                      <td className="px-4 py-2.5 font-mono text-sm">{r.date}</td>
                      <td className="px-4 py-2.5 font-mono text-right font-semibold text-orange-500">
                        ${Number(r.spendAmount).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-right text-primary">
                        ${Number(r.realBalance).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
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
      <TableCell colSpan={8} className="p-0">
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
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">当前余额</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">今日消耗</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{hasFilter ? "期间消耗" : "累计消耗"}</th>
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
                    <td className="px-4 py-2 font-mono font-semibold text-primary">${Number(acc.currentBalance).toFixed(2)}</td>
                    <td className="px-4 py-2 font-mono">${Number(acc.todaySpend).toFixed(2)}</td>
                    <td className="px-4 py-2 font-mono">${Number(acc.totalSpend).toFixed(2)}</td>
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedAccount, setSelectedAccount] = useState<SelectedAccount | null>(null);

  const params: Record<string, string> = {};
  if (dateRange.from) params.dateFrom = dateRange.from;
  if (dateRange.to) params.dateTo = dateRange.to;

  const { data, isLoading } = useGetSpendByPitcher(params);
  const rows = Array.isArray(data) ? (data as PitcherSpend[]) : [];
  const paged = usePagination(rows, PAGE_SIZE, page);

  const hasFilter = !!(dateRange.from || dateRange.to);
  const totalTodaySpend = rows.reduce((s, r) => s + Number(r.todaySpend), 0);
  const totalPeriodSpend = rows.reduce((s, r) => s + Number(r.totalSpend), 0);
  const totalBalance = rows.reduce((s, r) => s + Number(r.totalBalance), 0);
  const todayRecharge = rows.reduce((s, r) => s + Number(r.todayRecharge), 0);
  const totalRecharge = rows.reduce((s, r) => s + Number(r.totalRecharge), 0);
  const totalAccounts = rows.reduce((s, r) => s + r.accountCount, 0);
  const topPitcher = rows.length > 0 ? rows.reduce((best, r) => Number(r.totalSpend) > Number(best.totalSpend) ? r : best) : null;

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
      <div>
        <h1 className="text-xl font-bold">投手报表</h1>
        <p className="text-sm text-muted-foreground mt-0.5">按投手统计消耗数据，点击行展开账户明细</p>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">统计时间范围</p>
        <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r); setPage(1); }} />
      </div>

      <StatsBar items={[
        { label: "投手数量", value: rows.length },
        { label: "今日总消耗", value: `$${totalTodaySpend.toFixed(2)}`, color: "blue" },
        { label: hasFilter ? "期间总消耗" : "累计总消耗", value: `$${totalPeriodSpend.toFixed(2)}`, color: "purple" },
        { label: "账户余额合计", value: `$${totalBalance.toFixed(2)}`, color: "green" },
        { label: "今日充值", value: `$${todayRecharge.toFixed(2)}`, color: "amber" },
        { label: hasFilter ? "期间充值" : "累计充值", value: `$${totalRecharge.toFixed(2)}` },
        { label: "账户总数", value: totalAccounts },
        { label: "消耗最高", value: topPitcher ? topPitcher.pitcherName : "—", color: "amber" },
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-8" />
              <TableHead>投手名称</TableHead>
              <TableHead>今日消耗</TableHead>
              <TableHead>{hasFilter ? "期间消耗" : "累计消耗"}</TableHead>
              <TableHead>余额合计</TableHead>
              <TableHead>今日充值</TableHead>
              <TableHead>{hasFilter ? "期间充值" : "累计充值"}</TableHead>
              <TableHead>账户数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
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
                    <TableCell className="font-mono">${Number(r.todaySpend).toFixed(2)}</TableCell>
                    <TableCell className="font-mono">${Number(r.totalSpend).toFixed(2)}</TableCell>
                    <TableCell className="font-mono font-semibold text-primary">${Number(r.totalBalance).toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-amber-600">${Number(r.todayRecharge).toFixed(2)}</TableCell>
                    <TableCell className="font-mono">${Number(r.totalRecharge).toFixed(2)}</TableCell>
                    <TableCell>
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
        <TablePagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
      </div>

      <AccountHistoryDialog
        account={selectedAccount}
        onClose={() => setSelectedAccount(null)}
      />
    </div>
  );
}
