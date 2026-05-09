import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAccounts,
  useAssignAccount,
  useUpdateAccount,
  useCreateRechargeOrder,
  useListRechargeOrders,
  useListUsers,
  getListRechargeOrdersQueryKey,
  getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AccountStatusBadge, PlatformBadge, RechargeStatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateRangePicker, type DateRange } from "@/components/shared/DateRangePicker";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Search, History, Plus, UserCheck } from "lucide-react";

interface Account {
  id: number;
  platformAccountId: string;
  accountName: string;
  platform: string;
  status: "idle" | "active" | "banned";
  pitcherId: number | null;
  currentBalance: string;
  theoreticalBalance?: string | null;
  lastReportedAt?: string | null;
  createdAt: string;
}

interface PitcherUser {
  id: number;
  displayName: string;
  role: string;
}

interface RechargeOrder {
  id: number;
  accountId?: number;
  accountName?: string;
  amount: string;
  status: "pending" | "completed" | "rejected";
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

const PAGE_SIZE = 20;

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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
        toast({ title: "状态已更新" });
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

function RechargeDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const create = useCreateRechargeOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRechargeOrdersQueryKey({}) });
        toast({ title: "充值申请已提交", description: "请等待开户商审核处理。" });
        onClose();
      },
      onError: () => {
        toast({ title: "提交失败", description: "请稍后重试。", variant: "destructive" });
      },
    },
  });

  const handleSubmit = () => {
    if (!amount || Number(amount) <= 0) {
      toast({ title: "请填写有效的充值金额", variant: "destructive" });
      return;
    }
    create.mutate({ data: { accountId: account.id, amount, note: note || undefined } });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>充值申请</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs mb-0.5">目标账户</p>
            <p className="font-medium truncate">{account.accountName}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{account.platformAccountId}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">充值金额（美元）<span className="text-destructive">*</span></Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">备注（选填）</Label>
            <Textarea
              placeholder="向开户商说明充值用途..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? "提交中..." : "提交申请"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [selectedPitcherId, setSelectedPitcherId] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: usersData } = useListUsers({ role: "pitcher" });
  const pitchers = useMemo(() => {
    const all = Array.isArray(usersData) ? (usersData as PitcherUser[]) : [];
    return all.filter((p) => p.id !== user?.id);
  }, [usersData, user]);

  const assign = useAssignAccount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
        toast({ title: "账户已分配成功" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "分配失败，请重试";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const handleAssign = () => {
    if (!selectedPitcherId) {
      toast({ title: "请选择目标投手", variant: "destructive" });
      return;
    }
    assign.mutate({ id: account.id, data: { pitcherId: Number(selectedPitcherId) } });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>分配账户</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs mb-0.5">待分配账户</p>
            <p className="font-medium truncate">{account.accountName}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{account.platformAccountId}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">分配给投手 <span className="text-destructive">*</span></Label>
            <Select value={selectedPitcherId} onValueChange={setSelectedPitcherId}>
              <SelectTrigger>
                <SelectValue placeholder="选择投手..." />
              </SelectTrigger>
              <SelectContent>
                {pitchers.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
            分配后账户状态变为「运行中」。只有管理员可以转移已分配的账户。
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleAssign} disabled={assign.isPending}>
            {assign.isPending ? "分配中..." : "确认分配"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RechargeHistoryDialog({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useListRechargeOrders({} as Record<string, string>);
  const orders = useMemo(() => {
    const all = Array.isArray(data) ? (data as RechargeOrder[]) : [];
    return [...all].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>充值记录</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>账户</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>备注</TableHead>
                <TableHead>申请时间</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
                  ))}
                </TableRow>
              ))}
              {!isLoading && orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    暂无充值申请记录
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-sm font-medium max-w-[160px]">
                    <TruncatedCell value={o.accountName ?? `账户 #${o.id}`} />
                  </TableCell>
                  <TableCell className="font-mono text-sm">${Number(o.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[140px]">
                    <TruncatedCell value={o.note || "—"} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell><RechargeStatusBadge status={o.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PitcherAccountsPage() {
  const { user } = useAuth();
  const canAssign = user?.canAssignAccounts ?? false;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [poolPage, setPoolPage] = useState(1);
  const [rechargeTarget, setRechargeTarget] = useState<Account | null>(null);
  const [assignTarget, setAssignTarget] = useState<Account | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data, isLoading } = useListAccounts({});
  const allAccounts = Array.isArray(data) ? (data as unknown as Account[]) : [];

  const myAccounts = allAccounts.filter((a) => a.pitcherId === user?.id);
  const poolAccounts = canAssign ? allAccounts.filter((a) => a.pitcherId === null) : [];

  const filtered = useMemo(() => {
    let rows = myAccounts;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((a) => a.accountName.toLowerCase().includes(q) || a.platformAccountId.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") rows = rows.filter((a) => a.status === statusFilter);
    if (platformFilter !== "all") rows = rows.filter((a) => a.platform === platformFilter);
    if (dateRange.from) rows = rows.filter((a) => a.createdAt >= dateRange.from);
    if (dateRange.to) rows = rows.filter((a) => a.createdAt <= dateRange.to + "T23:59:59");
    return rows;
  }, [myAccounts, search, statusFilter, platformFilter, dateRange]);

  const paged = usePagination(filtered, PAGE_SIZE, page);
  const pagedPool = usePagination(poolAccounts, PAGE_SIZE, poolPage);

  const activeCount = filtered.filter((a) => a.status === "active").length;
  const totalBalance = filtered.reduce((s, a) => s + Number(a.currentBalance), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">我的账户</h1>
          <p className="text-sm text-muted-foreground mt-0.5">分配给您的广告账户列表</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowHistory(true)}>
          <History className="h-4 w-4" /> 充值记录
        </Button>
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
        { label: "我的账户", value: filtered.length },
        { label: "运行中", value: activeCount, color: activeCount > 0 ? "green" : "default" },
        { label: "余额合计", value: `$${totalBalance.toFixed(2)}`, color: "blue" },
        ...(canAssign ? [{ label: "待分配", value: poolAccounts.length, color: "amber" as const }] : []),
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
              <TableHead className="w-20">操作</TableHead>
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
                <TableCell className="p-0 pl-2">
                  <StatusSelect account={a} />
                </TableCell>
                <TableCell className="font-mono">${Number(a.currentBalance).toFixed(2)}</TableCell>
                <TableCell className="font-mono text-muted-foreground">${Number(a.theoreticalBalance ?? 0).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{a.lastReportedAt ? new Date(a.lastReportedAt).toLocaleDateString("zh-CN") : "—"}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 px-2"
                    onClick={() => setRechargeTarget(a)}
                  >
                    <Plus className="h-3 w-3" /> 充值
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>

      {canAssign && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">待分配账户</h2>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{poolAccounts.length}</span>
          </div>
          <p className="text-sm text-muted-foreground -mt-1">以下账户尚未分配给任何投手，您可以将它们分配给其他投手。</p>

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>账户名称</TableHead>
                  <TableHead>平台账户ID</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>余额</TableHead>
                  <TableHead className="w-20">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedPool.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      暂无待分配账户
                    </TableCell>
                  </TableRow>
                )}
                {pagedPool.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium max-w-[160px]"><TruncatedCell value={a.accountName} /></TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground max-w-[140px]"><TruncatedCell value={a.platformAccountId} /></TableCell>
                    <TableCell><PlatformBadge platform={a.platform} /></TableCell>
                    <TableCell className="p-0 pl-2">
                      <StatusSelect account={a} />
                    </TableCell>
                    <TableCell className="font-mono">${Number(a.currentBalance).toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 px-2"
                        onClick={() => setAssignTarget(a)}
                      >
                        <UserCheck className="h-3 w-3" /> 分配
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination page={poolPage} pageSize={PAGE_SIZE} total={poolAccounts.length} onPageChange={setPoolPage} />
          </div>
        </div>
      )}

      {rechargeTarget && (
        <RechargeDialog account={rechargeTarget} onClose={() => setRechargeTarget(null)} />
      )}
      {assignTarget && (
        <AssignDialog account={assignTarget} onClose={() => setAssignTarget(null)} />
      )}
      {showHistory && (
        <RechargeHistoryDialog onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
