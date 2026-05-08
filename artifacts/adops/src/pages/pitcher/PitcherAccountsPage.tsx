import { useState, useMemo } from "react";
import { useListAccounts } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountStatusBadge, PlatformBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateRangePicker, type DateRange } from "@/components/shared/DateRangePicker";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { CreditCard, Search } from "lucide-react";
import { TruncatedCell } from "@/components/shared/TruncatedCell";

interface Account {
  id: number;
  platformAccountId: string;
  accountName: string;
  platform: string;
  status: "idle" | "active" | "banned";
  currentBalance: string;
  theoreticalBalance?: string | null;
  lastReportedAt?: string | null;
  createdAt: string;
}

const PAGE_SIZE = 20;

export default function PitcherAccountsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);

  const { data, isLoading } = useListAccounts({});
  const allAccounts = Array.isArray(data) ? (data as unknown as Account[]) : [];

  const filtered = useMemo(() => {
    let rows = allAccounts;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((a) => a.accountName.toLowerCase().includes(q) || a.platformAccountId.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") rows = rows.filter((a) => a.status === statusFilter);
    if (platformFilter !== "all") rows = rows.filter((a) => a.platform === platformFilter);
    if (dateRange.from) rows = rows.filter((a) => a.createdAt >= dateRange.from);
    if (dateRange.to) rows = rows.filter((a) => a.createdAt <= dateRange.to + "T23:59:59");
    return rows;
  }, [allAccounts, search, statusFilter, platformFilter, dateRange]);

  const paged = usePagination(filtered, PAGE_SIZE, page);

  const activeCount = filtered.filter((a) => a.status === "active").length;
  const idleCount = filtered.filter((a) => a.status === "idle").length;
  const bannedCount = filtered.filter((a) => a.status === "banned").length;
  const totalBalance = filtered.reduce((s, a) => s + Number(a.currentBalance), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">我的账户</h1>
        <p className="text-sm text-muted-foreground mt-0.5">分配给您的广告账户列表</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 w-56 text-sm" placeholder="搜索账户名称或ID..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="idle">空闲</SelectItem>
            <SelectItem value="active">运行中</SelectItem>
            <SelectItem value="banned">已封禁</SelectItem>
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部平台</SelectItem>
            {["FB", "GG", "TT", "TW", "OTHER"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">创建时间</p>
        <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r); setPage(1); }} />
      </div>

      <StatsBar items={[
        { label: "账户总数", value: filtered.length },
        { label: "运行中", value: activeCount, color: activeCount > 0 ? "green" : "default" },
        { label: "空闲", value: idleCount, color: "amber" },
        { label: "已封禁", value: bannedCount, color: bannedCount > 0 ? "red" : "default" },
        { label: "余额合计", value: `$${totalBalance.toFixed(2)}`, color: "blue" },
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>账户名称</TableHead>
              <TableHead>平台账户ID</TableHead>
              <TableHead>平台</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>实际余额</TableHead>
              <TableHead>理论余额</TableHead>
              <TableHead>最近上报</TableHead>
              <TableHead>创建时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={8}><EmptyState icon={CreditCard} title="暂无账户" description="请联系管理员为您分配账户。" /></TableCell></TableRow>
            )}
            {!isLoading && paged.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium max-w-[160px]"><TruncatedCell value={a.accountName} /></TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground max-w-[140px]"><TruncatedCell value={a.platformAccountId} /></TableCell>
                <TableCell><PlatformBadge platform={a.platform} /></TableCell>
                <TableCell><AccountStatusBadge status={a.status} /></TableCell>
                <TableCell className="font-mono">${Number(a.currentBalance).toFixed(2)}</TableCell>
                <TableCell className="font-mono text-muted-foreground">${Number(a.theoreticalBalance ?? 0).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{a.lastReportedAt ? new Date(a.lastReportedAt).toLocaleDateString("zh-CN") : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("zh-CN")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
