import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListAccounts, useListUsers, useAssignAccount, getListAccountsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountStatusBadge, PlatformBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateRangePicker, type DateRange } from "@/components/shared/DateRangePicker";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { CreditCard, UserPlus, Search } from "lucide-react";

interface Account {
  id: number;
  platformAccountId: string;
  accountName: string;
  platform: string;
  providerId: number | null;
  pitcherId?: number | null;
  status: "idle" | "active" | "banned";
  currentBalance: string;
  theoreticalBalance?: string | null;
  lastReportedAt?: string | null;
  createdAt: string;
  providerName?: string | null;
  pitcherName?: string | null;
}

interface UserRow { id: number; displayName: string; role: string; }

function AssignDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [pitcherId, setPitcherId] = useState<string>(account.pitcherId?.toString() ?? "");
  const queryClient = useQueryClient();
  const { data: usersData } = useListUsers({ role: "pitcher" });
  const assign = useAssignAccount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
        onClose();
      },
    },
  });

  const pitchers = Array.isArray(usersData) ? (usersData as UserRow[]).filter((u) => u.role === "pitcher") : [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>分配投手 — {account.accountName}</DialogTitle></DialogHeader>
        <div className="py-2">
          <Select value={pitcherId} onValueChange={setPitcherId}>
            <SelectTrigger><SelectValue placeholder="选择投手..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不分配（取消）</SelectItem>
              {pitchers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            onClick={() => assign.mutate({ id: account.id, data: { pitcherId: pitcherId && pitcherId !== "none" ? Number(pitcherId) : null } })}
            disabled={assign.isPending}
          >
            {assign.isPending ? "保存中..." : "确认分配"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PAGE_SIZE = 20;

export default function AccountsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [pitcherFilter, setPitcherFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [assignAccount, setAssignAccount] = useState<Account | null>(null);

  const apiParams: Record<string, string> = {};
  if (statusFilter !== "all") apiParams.status = statusFilter;
  if (providerFilter !== "all") apiParams.providerId = providerFilter;
  if (pitcherFilter !== "all") apiParams.pitcherId = pitcherFilter;

  const { data, isLoading } = useListAccounts(apiParams);
  const { data: usersData } = useListUsers({});
  const allAccounts = Array.isArray(data) ? (data as unknown as Account[]) : [];
  const users = Array.isArray(usersData) ? (usersData as UserRow[]) : [];
  const providers = users.filter((u) => u.role === "provider");
  const pitchers = users.filter((u) => u.role === "pitcher");

  const filtered = useMemo(() => {
    let rows = allAccounts;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((a) =>
        a.accountName.toLowerCase().includes(q) ||
        a.platformAccountId.toLowerCase().includes(q)
      );
    }
    if (platformFilter !== "all") rows = rows.filter((a) => a.platform === platformFilter);
    if (dateRange.from) rows = rows.filter((a) => a.createdAt >= dateRange.from);
    if (dateRange.to) rows = rows.filter((a) => a.createdAt <= dateRange.to + "T23:59:59");
    return rows;
  }, [allAccounts, search, platformFilter, dateRange]);

  const paged = usePagination(filtered, PAGE_SIZE, page);

  const activeCount = filtered.filter((a) => a.status === "active").length;
  const idleCount = filtered.filter((a) => a.status === "idle").length;
  const bannedCount = filtered.filter((a) => a.status === "banned").length;
  const unassignedCount = filtered.filter((a) => !a.pitcherId).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">账户管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理各平台广告账户</p>
        </div>
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
        <Select value={providerFilter} onValueChange={(v) => { setProviderFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部开户商</SelectItem>
            {providers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={pitcherFilter} onValueChange={(v) => { setPitcherFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部投手</SelectItem>
            {pitchers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
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
        { label: "未分配投手", value: unassignedCount, color: unassignedCount > 0 ? "amber" : "default" },
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>账户名称</TableHead>
              <TableHead>平台账户ID</TableHead>
              <TableHead>平台</TableHead>
              <TableHead>开户商</TableHead>
              <TableHead>投手</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>余额</TableHead>
              <TableHead>最近上报</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-20">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 10 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={10}>
                <EmptyState icon={CreditCard} title="暂无账户" description="调整筛选条件或等待开户商添加账户。" />
              </TableCell></TableRow>
            )}
            {!isLoading && paged.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium max-w-[160px] truncate">{a.accountName}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">{a.platformAccountId}</TableCell>
                <TableCell><PlatformBadge platform={a.platform} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{a.providerName ?? "—"}</TableCell>
                <TableCell className="text-sm">{a.pitcherName ?? <span className="text-amber-500 text-xs">未分配</span>}</TableCell>
                <TableCell><AccountStatusBadge status={a.status} /></TableCell>
                <TableCell className="font-mono text-sm">${Number(a.currentBalance).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{a.lastReportedAt ? new Date(a.lastReportedAt).toLocaleDateString("zh-CN") : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAssignAccount(a)}>
                    <UserPlus className="h-3.5 w-3.5" /> 分配
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>

      {assignAccount && <AssignDialog account={assignAccount} onClose={() => setAssignAccount(null)} />}
    </div>
  );
}
