import { useState, useMemo } from "react";
import {
  useListAccounts,
  useUpdateAccount,
  useCreateRechargeOrder,
  useListRechargeOrders,
  useUpdateRechargeOrder,
  useListDailyStats,
  getListRechargeOrdersQueryKey,
  getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Search, History, Plus, Pencil } from "lucide-react";

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

interface RechargeOrder {
  id: number;
  accountId?: number;
  accountName?: string;
  amount: string;
  actualAmount?: string | null;
  feeRate?: string | null;
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

function RechargeDialog({ account, onClose }: { account: Account & { feeRate?: string | null }; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: ordersData } = useListRechargeOrders({} as Record<string, string>);
  const feeRate = useMemo(() => {
    if (account.feeRate) return parseFloat(account.feeRate);
    const orders = Array.isArray(ordersData) ? (ordersData as RechargeOrder[]) : [];
    const related = orders.find((o) => o.feeRate && (o.accountId === account.id || true));
    return related?.feeRate ? parseFloat(related.feeRate) : null;
  }, [account, ordersData]);

  const estimatedActual = useMemo(() => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0 || feeRate == null) return null;
    return (val * (1 - feeRate / 100)).toFixed(2);
  }, [amount, feeRate]);

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
            {feeRate != null && amount && Number(amount) > 0 && (
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-muted-foreground">手续费率 {feeRate}%</span>
                {estimatedActual && (
                  <span className="text-green-600 font-medium">预估到账 <span className="font-mono">${estimatedActual}</span></span>
                )}
              </div>
            )}
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

function EditAmountDialog({ order, onClose }: { order: RechargeOrder; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(Number(order.amount).toFixed(2)));
  const [note, setNote] = useState(order.note ?? "");

  const update = useUpdateRechargeOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRechargeOrdersQueryKey({}) });
        toast({ title: "修改成功", description: "充值金额已更新，等待审核。" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "修改失败，请重试";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const handleSave = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      toast({ title: "请输入有效金额", variant: "destructive" });
      return;
    }
    update.mutate({ id: order.id, data: { amount: val.toFixed(2), note: note || null } });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>修改充值金额</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs mb-0.5">充值账户</p>
            <p className="font-medium">{order.accountName ?? `订单 #${order.id}`}</p>
            <p className="text-xs text-muted-foreground mt-0.5">原金额：<span className="font-mono">${Number(order.amount).toFixed(2)}</span></p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">新充值金额（美元）<span className="text-destructive">*</span></Label>
            <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">备注（选填）</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="说明修改原因..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={update.isPending}>{update.isPending ? "保存中..." : "确认修改"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RechargeHistoryDialog({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useListRechargeOrders({} as Record<string, string>);
  const [editTarget, setEditTarget] = useState<RechargeOrder | null>(null);
  const orders = useMemo(() => {
    const all = Array.isArray(data) ? (data as RechargeOrder[]) : [];
    return [...all].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data]);

  return (
    <>
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
                  <TableHead className="w-16">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))}
                {!isLoading && orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
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
                    <TableCell>
                      {o.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditTarget(o)}
                        >
                          <Pencil className="h-3 w-3" />
                          修改
                        </Button>
                      )}
                    </TableCell>
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
      {editTarget && (
        <EditAmountDialog order={editTarget} onClose={() => setEditTarget(null)} />
      )}
    </>
  );
}

interface SelectedAccount {
  accountId: number;
  accountName: string;
  platformAccountId: string;
}

function AccountHistoryDialog({ account, onClose }: { account: SelectedAccount | null; onClose: () => void }) {
  const { data, isLoading, isError } = useListDailyStats(
    account ? { accountId: account.accountId } : undefined,
  );
  const rows = useMemo(() => {
    const raw = Array.isArray(data) ? (data as Array<{ id: number; date: string; spendAmount: string | number; realBalance: string | number }>) : [];
    return [...raw].sort((a, b) => b.date.localeCompare(a.date));
  }, [data]);
  const totalSpend = rows.reduce((s, r) => s + Number(r.spendAmount), 0);

  return (
    <Dialog open={!!account} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            历史消耗记录
          </DialogTitle>
          {account && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {account.accountName}
              {account.platformAccountId && <span className="ml-2 font-mono opacity-70">({account.platformAccountId})</span>}
            </p>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
                    <tr key={r.id} className={["border-b border-border/40 last:border-0", idx % 2 === 1 ? "bg-muted/20" : ""].join(" ")}>
                      <td className="px-4 py-2.5 font-mono text-sm">{r.date}</td>
                      <td className="px-4 py-2.5 font-mono text-right font-semibold text-orange-500">${Number(r.spendAmount).toFixed(2)}</td>
                      <td className="px-4 py-2.5 font-mono text-right text-primary">${Number(r.realBalance).toFixed(2)}</td>
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

export default function PitcherAccountsPage() {
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [rechargeTarget, setRechargeTarget] = useState<Account | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [spendHistory, setSpendHistory] = useState<SelectedAccount | null>(null);

  const { data, isLoading } = useListAccounts({});
  const allAccounts = Array.isArray(data) ? (data as unknown as Account[]) : [];
  const myAccounts = allAccounts.filter((a) => a.pitcherId === user?.id);

  const filtered = useMemo(() => {
    let rows = myAccounts;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((a) => a.accountName.toLowerCase().includes(q) || a.platformAccountId.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") rows = rows.filter((a) => a.status === statusFilter);
    if (platformFilter !== "all") rows = rows.filter((a) => a.platform === platformFilter);
    return rows;
  }, [myAccounts, search, statusFilter, platformFilter]);

  const paged = usePagination(filtered, PAGE_SIZE, page);
  const activeCount = filtered.filter((a) => a.status === "active").length;
  const totalBalance = filtered.reduce((s, a) => s + Number(a.currentBalance), 0);

  return (
    <div className="space-y-4">
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
          <Input
            className="pl-8 h-8 w-56 text-sm"
            placeholder="搜索账户名称或ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
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

      <StatsBar items={[
        { label: "我的账户", value: filtered.length },
        { label: "运行中", value: activeCount, color: activeCount > 0 ? "green" : "default" },
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
              <TableRow>
                <TableCell colSpan={8}>
                  <EmptyState icon={CreditCard} title="暂无账户" description="请联系管理员为您分配账户，或前往「账户分配」自助领取空闲账户。" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && paged.map((a) => (
              <TableRow
                key={a.id}
                className="cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => setSpendHistory({ accountId: a.id, accountName: a.accountName, platformAccountId: a.platformAccountId })}
              >
                <TableCell className="font-medium max-w-[160px]">
                  <div className="flex items-center gap-1.5">
                    <History className="h-3 w-3 text-muted-foreground shrink-0" />
                    <TruncatedCell value={a.accountName} />
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground max-w-[140px]"><TruncatedCell value={a.platformAccountId} /></TableCell>
                <TableCell><PlatformBadge platform={a.platform} /></TableCell>
                <TableCell className="p-0 pl-2" onClick={(e) => e.stopPropagation()}>
                  <StatusSelect account={a} />
                </TableCell>
                <TableCell className="font-mono">${Number(a.currentBalance).toFixed(2)}</TableCell>
                <TableCell className="font-mono text-muted-foreground">${Number(a.theoreticalBalance ?? 0).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {a.lastReportedAt ? new Date(a.lastReportedAt).toLocaleDateString("zh-CN") : "—"}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
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

      {rechargeTarget && (
        <RechargeDialog account={rechargeTarget} onClose={() => setRechargeTarget(null)} />
      )}
      {showHistory && (
        <RechargeHistoryDialog onClose={() => setShowHistory(false)} />
      )}
      <AccountHistoryDialog
        account={spendHistory}
        onClose={() => setSpendHistory(null)}
      />
    </div>
  );
}
