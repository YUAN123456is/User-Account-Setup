import { useState, useMemo } from "react";
import { useGetCrossReport, useListUsers } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { QuickDateFilter, type DateRange } from "@/components/shared/QuickDateFilter";
import { GitMerge, Search } from "lucide-react";

interface CrossRow {
  pitcherId: number;
  pitcherName: string;
  providerId: number;
  providerName: string;
  totalSpend: string | number;
  accountCount: number;
}

interface UserRow { id: number; displayName: string; role: string; }

const PAGE_SIZE = 20;

export default function CrossReportPage() {
  const [pitcherFilter, setPitcherFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const params: Record<string, string> = {};
  if (pitcherFilter !== "all") params.pitcherId = pitcherFilter;
  if (providerFilter !== "all") params.providerId = providerFilter;
  if (dateRange.from) params.dateFrom = dateRange.from;
  if (dateRange.to) params.dateTo = dateRange.to;

  const { data, isLoading } = useGetCrossReport(params);
  const { data: usersData } = useListUsers({});
  const allRows = Array.isArray(data) ? (data as CrossRow[]) : [];
  const users = Array.isArray(usersData) ? (usersData as UserRow[]) : [];
  const pitchers = users.filter((u) => u.role === "pitcher");
  const providers = users.filter((u) => u.role === "provider");

  const filtered = useMemo(() => {
    if (!search.trim()) return allRows;
    const q = search.toLowerCase();
    return allRows.filter((r) => r.pitcherName.toLowerCase().includes(q) || r.providerName.toLowerCase().includes(q));
  }, [allRows, search]);

  const paged = usePagination(filtered, PAGE_SIZE, page);

  const totalSpend = filtered.reduce((s, r) => s + Number(r.totalSpend), 0);
  const totalAccounts = filtered.reduce((s, r) => s + r.accountCount, 0);
  const uniquePitchers = new Set(filtered.map((r) => r.pitcherId)).size;
  const uniqueProviders = new Set(filtered.map((r) => r.providerId)).size;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">交叉报表</h1>
        <p className="text-sm text-muted-foreground mt-0.5">投手 × 开户商消耗矩阵</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 w-48 text-sm" placeholder="搜索投手或开户商..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={pitcherFilter} onValueChange={(v) => { setPitcherFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="全部投手" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部投手</SelectItem>
            {pitchers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={providerFilter} onValueChange={(v) => { setProviderFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="全部开户商" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部开户商</SelectItem>
            {providers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <QuickDateFilter onChange={(r) => { setDateRange(r); setPage(1); }} />
        </div>
      </div>

      <StatsBar items={[
        { label: "总消耗金额", value: `$${totalSpend.toFixed(2)}`, color: "blue" },
        { label: "涉及投手", value: uniquePitchers },
        { label: "涉及开户商", value: uniqueProviders },
        { label: "账户总数", value: totalAccounts },
        { label: "记录条数", value: filtered.length },
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>投手</TableHead>
              <TableHead>开户商</TableHead>
              <TableHead>消耗金额</TableHead>
              <TableHead>账户数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 4 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={4}><EmptyState icon={GitMerge} title="暂无数据" description="上报每日数据后将在此显示交叉报表。" /></TableCell></TableRow>
            )}
            {!isLoading && paged.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.pitcherName}</TableCell>
                <TableCell>{r.providerName}</TableCell>
                <TableCell className="font-mono">${Number(r.totalSpend).toFixed(2)}</TableCell>
                <TableCell>{r.accountCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
