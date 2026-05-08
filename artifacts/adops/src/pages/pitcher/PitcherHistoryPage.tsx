import { useState, useMemo } from "react";
import { useListDailyStats, useListAccounts } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateRangePicker, type DateRange } from "@/components/shared/DateRangePicker";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { History, Search } from "lucide-react";

interface DailyStat {
  id: number;
  accountId: number;
  accountName?: string;
  date: string;
  spendAmount: string | number;
  realBalance: string | number;
  hasAlert: boolean;
}

interface Account { id: number; accountName: string; }

const PAGE_SIZE = 20;

export default function PitcherHistoryPage() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [accountFilter, setAccountFilter] = useState("all");
  const [alertFilter, setAlertFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const apiParams: Record<string, string> = {};
  if (dateRange.from) apiParams.dateFrom = dateRange.from;
  if (dateRange.to) apiParams.dateTo = dateRange.to;
  if (accountFilter !== "all") apiParams.accountId = accountFilter;

  const { data, isLoading } = useListDailyStats(apiParams);
  const { data: accountsData } = useListAccounts({});
  const allStats = Array.isArray(data) ? (data as DailyStat[]) : [];
  const accounts = Array.isArray(accountsData) ? (accountsData as Account[]) : [];

  const filtered = useMemo(() => {
    let rows = allStats;
    if (alertFilter === "alert") rows = rows.filter((s) => s.hasAlert);
    if (alertFilter === "normal") rows = rows.filter((s) => !s.hasAlert);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((s) => (s.accountName ?? "").toLowerCase().includes(q));
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [allStats, alertFilter, search]);

  const paged = usePagination(filtered, PAGE_SIZE, page);

  const totalSpend = filtered.reduce((s, r) => s + Number(r.spendAmount), 0);
  const alertCount = filtered.filter((s) => s.hasAlert).length;
  const uniqueDays = new Set(filtered.map((s) => s.date)).size;
  const uniqueAccounts = new Set(filtered.map((s) => s.accountId)).size;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">上报记录</h1>
        <p className="text-sm text-muted-foreground mt-0.5">您提交的全部每日上报历史</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 w-48 text-sm" placeholder="搜索账户名称..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={accountFilter} onValueChange={(v) => { setAccountFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部账户</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.accountName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={alertFilter} onValueChange={(v) => { setAlertFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="normal">正常</SelectItem>
            <SelectItem value="alert">预警</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">上报日期</p>
        <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r); setPage(1); }} />
      </div>

      <StatsBar items={[
        { label: "总消耗金额", value: `$${totalSpend.toFixed(2)}`, color: "blue" },
        { label: "上报天数", value: uniqueDays },
        { label: "涉及账户", value: uniqueAccounts },
        { label: "预警次数", value: alertCount, color: alertCount > 0 ? "red" : "default" },
        { label: "上报条数", value: filtered.length },
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>日期</TableHead>
              <TableHead>账户</TableHead>
              <TableHead>消耗金额</TableHead>
              <TableHead>实际余额</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 5 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={5}><EmptyState icon={History} title="暂无上报记录" description="调整筛选条件或提交每日数据。" /></TableCell></TableRow>
            )}
            {!isLoading && paged.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-sm">{s.date}</TableCell>
                <TableCell className="font-medium">{s.accountName ?? `账户 #${s.accountId}`}</TableCell>
                <TableCell className="font-mono">${Number(s.spendAmount).toFixed(2)}</TableCell>
                <TableCell className="font-mono">${Number(s.realBalance).toFixed(2)}</TableCell>
                <TableCell>
                  {s.hasAlert
                    ? <Badge variant="destructive" className="text-xs">预警</Badge>
                    : <Badge variant="outline" className="text-xs text-muted-foreground">正常</Badge>}
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
