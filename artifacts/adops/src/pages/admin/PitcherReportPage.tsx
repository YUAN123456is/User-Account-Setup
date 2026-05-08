import { useState } from "react";
import { useGetSpendByPitcher, useGetPitcherAccounts } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateRangePicker, type DateRange } from "@/components/shared/DateRangePicker";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { AccountStatusBadge, PlatformBadge } from "@/components/shared/StatusBadge";
import { BarChart3, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
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

function AccountDetailRows({
  pitcherId,
  dateRange,
}: {
  pitcherId: number;
  dateRange: DateRange;
}) {
  const params: Record<string, string | number> = { pitcherId };
  if (dateRange.from) params.dateFrom = dateRange.from;
  if (dateRange.to) params.dateTo = dateRange.to;

  const { data, isLoading } = useGetPitcherAccounts(params as Parameters<typeof useGetPitcherAccounts>[0]);
  const rows = Array.isArray(data) ? (data as PitcherAccountDetail[]) : [];

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={8} className="bg-muted/20 py-6 text-center">
          <Loader2 className="h-4 w-4 animate-spin inline-block text-muted-foreground" />
        </TableCell>
      </TableRow>
    );
  }

  if (rows.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={8} className="bg-muted/20 text-center text-sm text-muted-foreground py-4">
          该投手暂无账户
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      <TableRow className="bg-muted/10 hover:bg-muted/10">
        <TableCell colSpan={8} className="py-1.5 px-6">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">账户明细</span>
        </TableCell>
      </TableRow>
      {rows.map((acc) => (
        <TableRow key={acc.accountId} className="bg-muted/5 hover:bg-muted/10">
          <TableCell className="pl-10 w-4" />
          <TableCell className="font-medium text-sm">{acc.accountName}</TableCell>
          <TableCell className="font-mono text-xs text-muted-foreground">{acc.platformAccountId}</TableCell>
          <TableCell><PlatformBadge platform={acc.platform} /></TableCell>
          <TableCell><AccountStatusBadge status={acc.status as "idle" | "active" | "banned"} /></TableCell>
          <TableCell className="font-mono text-sm font-semibold text-primary">${Number(acc.currentBalance).toFixed(2)}</TableCell>
          <TableCell className="font-mono text-sm">${Number(acc.todaySpend).toFixed(2)}</TableCell>
          <TableCell className="font-mono text-sm">${Number(acc.totalSpend).toFixed(2)}</TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function PitcherReportPage() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const params: Record<string, string> = {};
  if (dateRange.from) params.dateFrom = dateRange.from;
  if (dateRange.to) params.dateTo = dateRange.to;

  const { data, isLoading } = useGetSpendByPitcher(params);
  const rows = Array.isArray(data) ? (data as PitcherSpend[]) : [];
  const paged = usePagination(rows, PAGE_SIZE, page);

  const hasFilter = dateRange.from || dateRange.to;
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
              <TableRow><TableCell colSpan={8}><EmptyState icon={BarChart3} title="暂无数据" description="投手上报每日数据后将在此显示。" /></TableCell></TableRow>
            )}
            {!isLoading && paged.map((r) => {
              const isOpen = expanded.has(r.pitcherId);
              return (
                <>
                  <TableRow
                    key={r.pitcherId}
                    className={cn("cursor-pointer select-none", isOpen && "bg-muted/20")}
                    onClick={() => toggleExpand(r.pitcherId)}
                  >
                    <TableCell className="w-8 text-muted-foreground">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell className="font-medium">{r.pitcherName}</TableCell>
                    <TableCell className="font-mono">${Number(r.todaySpend).toFixed(2)}</TableCell>
                    <TableCell className="font-mono">${Number(r.totalSpend).toFixed(2)}</TableCell>
                    <TableCell className="font-mono font-semibold text-primary">${Number(r.totalBalance).toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-amber-600">${Number(r.todayRecharge).toFixed(2)}</TableCell>
                    <TableCell className="font-mono">${Number(r.totalRecharge).toFixed(2)}</TableCell>
                    <TableCell>{r.accountCount}</TableCell>
                  </TableRow>
                  {isOpen && (
                    <AccountDetailRows key={`detail-${r.pitcherId}`} pitcherId={r.pitcherId} dateRange={dateRange} />
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
