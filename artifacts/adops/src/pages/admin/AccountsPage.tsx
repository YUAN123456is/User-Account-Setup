import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListAccounts, useListUsers, useAssignAccount, useDeleteAccount, useUpdateAccount, getListAccountsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountStatusBadge, PlatformBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, UserPlus, Search, Trash2, SlidersHorizontal, ChevronsUpDown, ChevronUp, ChevronDown, PencilLine, ShieldAlert } from "lucide-react";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { Label } from "@/components/ui/label";

const DELETE_PASSWORD = "110112";

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
  banNotifyProvider?: boolean;
}

interface UserRow { id: number; displayName: string; role: string; }

const STATUS_LABELS: Record<string, string> = {
  idle: "空闲",
  active: "运行中",
  banned: "已封禁",
};

function StatusSelect({ account }: { account: Account }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const update = useUpdateAccount({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
        if ((data as unknown as Account).status === "banned") {
          toast({
            title: "账户已封禁",
            description: "系统已通知开户商将该账户余额清零。",
          });
        } else {
          toast({ title: "状态已更新" });
        }
      },
      onError: () => {
        toast({ title: "更新失败", variant: "destructive" });
      },
    },
  });

  return (
    <Select
      value={account.status}
      onValueChange={(v) => {
        if (v === account.status) return;
        update.mutate({ id: account.id, data: { status: v } });
      }}
    >
      <SelectTrigger className="h-7 w-28 text-xs border-0 shadow-none bg-transparent px-1 focus:ring-0">
        <AccountStatusBadge status={account.status} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(STATUS_LABELS).map(([val, label]) => (
          <SelectItem key={val} value={val}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AssignDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [pitcherId, setPitcherId] = useState<string>(account.pitcherId?.toString() ?? "");
  const queryClient = useQueryClient();
  const { data: usersData } = useListUsers({ role: "pitcher" });
  const { toast } = useToast();
  const assign = useAssignAccount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
        toast({ title: pitcherId && pitcherId !== "none" ? "投手已分配" : "已取消分配" });
        onClose();
      },
      onError: () => {
        toast({ title: "分配失败，请重试", variant: "destructive" });
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

function BalanceEditDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [newBalance, setNewBalance] = useState(Number(account.currentBalance).toFixed(2));
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [pwError, setPwError] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleSave = async () => {
    const val = parseFloat(newBalance);
    if (isNaN(val)) { toast({ title: "请输入有效余额", variant: "destructive" }); return; }
    if (!password) { toast({ title: "请输入操作密码", variant: "destructive" }); return; }
    setSaving(true);
    setPwError(false);
    try {
      const res = await fetch(`${BASE}/api/accounts/${account.id}/set-balance`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentBalance: val.toFixed(2), password }),
      });
      if (res.status === 403) { setPwError(true); setSaving(false); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: err.error ?? "修改失败", variant: "destructive" });
        setSaving(false);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
      toast({ title: "余额已修改", description: `${account.accountName} → $${val.toFixed(2)}` });
      onClose();
    } catch {
      toast({ title: "网络错误，请重试", variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            修改余额
          </DialogTitle>
          <DialogDescription className="text-xs">
            此操作将直接覆盖账户余额，请谨慎填写。
          </DialogDescription>
        </DialogHeader>
        <div className="py-1 space-y-4">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground mb-0.5">账户</p>
            <p className="font-medium truncate">{account.accountName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              当前余额：<span className="font-mono text-foreground">${Number(account.currentBalance).toFixed(2)}</span>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">新余额（美元）<span className="text-destructive">*</span></Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                step="0.01"
                className="pl-6"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">操作密码<span className="text-destructive">*</span></Label>
            <Input
              type="password"
              placeholder="请输入管理员密码"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPwError(false); }}
              className={pwError ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {pwError && <p className="text-xs text-destructive">密码错误，请重试</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "确认修改"}
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
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [assignAccount, setAssignAccount] = useState<Account | null>(null);
  const [editBalanceAccount, setEditBalanceAccount] = useState<Account | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [sortKey, setSortKey] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteHook = useDeleteAccount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
        setDeleteAccount(null);
        toast({ title: "账户已删除" });
      },
      onError: () => {
        toast({ title: "删除失败", description: "请稍后重试。", variant: "destructive" });
      },
    },
  });

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

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[sortKey] ?? "";
      const vb = (b as unknown as Record<string, unknown>)[sortKey] ?? "";
      if (sortKey === "currentBalance") return sortDir === "asc" ? Number(va) - Number(vb) : Number(vb) - Number(va);
      const sa = String(va);
      const sb = String(vb);
      if (!sa && !sb) return 0;
      if (!sa) return sortDir === "asc" ? -1 : 1;
      if (!sb) return sortDir === "asc" ? 1 : -1;
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }, [filtered, sortKey, sortDir]);

  const paged = usePagination(sorted, PAGE_SIZE, page);

  const activeCount = filtered.filter((a) => a.status === "active").length;
  const idleCount = filtered.filter((a) => a.status === "idle").length;
  const bannedCount = filtered.filter((a) => a.status === "banned").length;
  const unassignedCount = filtered.filter((a) => !a.pitcherId).length;
  const totalBalance = filtered.reduce((s, a) => s + Number(a.currentBalance), 0);

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
        <div className="flex items-center rounded-md border border-border overflow-hidden h-8">
          {[
            { value: "all", label: "全部" },
            { value: "idle", label: "空闲" },
            { value: "active", label: "运行中" },
            { value: "banned", label: "封禁" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1); }}
              className={[
                "px-3 h-full text-xs font-medium transition-colors border-r border-border last:border-r-0",
                statusFilter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {(() => {
          const activeFilterCount = [
            platformFilter !== "all",
            providerFilter !== "all",
            pitcherFilter !== "all",
            !!(dateRange.from || dateRange.to),
          ].filter(Boolean).length;
          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  筛选
                  {activeFilterCount > 0 && (
                    <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-[10px] w-4 h-4 flex items-center justify-center font-semibold">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4 space-y-3" align="start">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">平台</p>
                  <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部平台</SelectItem>
                      {["FB", "GG", "TT", "TW", "OTHER"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">开户商</p>
                  <Select value={providerFilter} onValueChange={(v) => { setProviderFilter(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部开户商</SelectItem>
                      {providers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">投手</p>
                  <Select value={pitcherFilter} onValueChange={(v) => { setPitcherFilter(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部投手</SelectItem>
                      {pitchers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">创建时间</p>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="date"
                      value={dateRange.from}
                      onChange={(e) => { setDateRange((r) => ({ ...r, from: e.target.value })); setPage(1); }}
                      className="flex-1 h-7 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <span className="text-xs text-muted-foreground">至</span>
                    <input
                      type="date"
                      value={dateRange.to}
                      onChange={(e) => { setDateRange((r) => ({ ...r, to: e.target.value })); setPage(1); }}
                      className="flex-1 h-7 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full text-xs text-muted-foreground"
                    onClick={() => { setPlatformFilter("all"); setProviderFilter("all"); setPitcherFilter("all"); setDateRange({ from: "", to: "" }); setPage(1); }}
                  >
                    清除全部筛选
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          );
        })()}
      </div>

      <StatsBar items={[
        { label: "账户总数", value: filtered.length },
        { label: "运行中", value: activeCount, color: activeCount > 0 ? "green" : "default" },
        { label: "空闲", value: idleCount, color: "amber" },
        { label: "已封禁", value: bannedCount, color: bannedCount > 0 ? "red" : "default" },
        { label: "未分配投手", value: unassignedCount, color: unassignedCount > 0 ? "amber" : "default" },
        { label: "余额合计", value: `$${totalBalance.toFixed(2)}`, color: "green" },
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table className="min-w-max">
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
                  <SortHead col="accountName" label="账户名称" />
                  <SortHead col="platformAccountId" label="平台账户ID" />
                  <TableHead>平台</TableHead>
                  <SortHead col="providerName" label="开户商" />
                  <SortHead col="pitcherName" label="投手" />
                  <TableHead className="w-[120px]">状态</TableHead>
                  <SortHead col="currentBalance" label="余额" className="w-[100px] text-right" right />
                  <SortHead col="lastReportedAt" label="最近上报" />
                  <SortHead col="createdAt" label="创建时间" />
                  <TableHead className="w-20">操作</TableHead>
                </TableRow>
              );
            })()}
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
              <TableRow key={a.id} className={a.status === "banned" ? "bg-destructive/5" : undefined}>
                <TableCell className="font-medium max-w-[160px]"><TruncatedCell value={a.accountName} /></TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground max-w-[140px]"><TruncatedCell value={a.platformAccountId} /></TableCell>
                <TableCell><PlatformBadge platform={a.platform} /></TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[100px]">
                  {a.providerName ? <TruncatedCell value={a.providerName} /> : "—"}
                </TableCell>
                <TableCell className="text-sm max-w-[100px]">
                  {a.pitcherName ? <TruncatedCell value={a.pitcherName} /> : <span className="text-amber-500 text-xs">未分配</span>}
                </TableCell>
                <TableCell>
                  <StatusSelect account={a} />
                </TableCell>
                <TableCell className="font-mono text-sm text-right whitespace-nowrap">${Number(a.currentBalance).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{a.lastReportedAt ? new Date(a.lastReportedAt).toLocaleDateString("zh-CN") : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(a.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAssignAccount(a)}>
                      <UserPlus className="h-3.5 w-3.5" /> 分配
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                      title="修改余额（管理员）"
                      onClick={() => setEditBalanceAccount(a)}
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteAccount(a)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>

      {assignAccount && <AssignDialog account={assignAccount} onClose={() => setAssignAccount(null)} />}
      {editBalanceAccount && <BalanceEditDialog account={editBalanceAccount} onClose={() => setEditBalanceAccount(null)} />}

      {deleteAccount && (
        <Dialog open onOpenChange={() => { setDeleteAccount(null); setDeletePassword(""); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>删除账户</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <p className="text-sm text-muted-foreground">
                确认删除账户 <span className="font-semibold text-foreground">「{deleteAccount.accountName}」</span>？该账户的全部每日数据及充值订单将一并永久删除，操作不可撤销。
              </p>
              <div className="space-y-1.5">
                <Label className="text-sm">请输入操作密码以确认</Label>
                <Input
                  type="password"
                  placeholder="操作密码"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className={deletePassword && deletePassword !== DELETE_PASSWORD ? "border-destructive" : ""}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteAccount(null); setDeletePassword(""); }}>取消</Button>
              <Button
                variant="destructive"
                onClick={() => deleteHook.mutate({ id: deleteAccount.id })}
                disabled={deleteHook.isPending || deletePassword !== DELETE_PASSWORD}
              >
                {deleteHook.isPending ? "删除中..." : "确认删除"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
