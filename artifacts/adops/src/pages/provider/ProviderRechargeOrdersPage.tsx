import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListRechargeOrders, useUpdateRechargeOrder, getListRechargeOrdersQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RechargeStatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { Check, X, Receipt, Search, AlertTriangle, Loader2 } from "lucide-react";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { useToast } from "@/hooks/use-toast";

interface RechargeOrder {
  id: number;
  accountId: number;
  accountName?: string;
  amount: string | number;
  actualAmount?: string | null;
  feeRate?: string | null;
  pitcherName?: string | null;
  note?: string | null;
  status: "pending" | "completed" | "rejected";
  createdAt: string;
}

const PAGE_SIZE = 20;

function ApproveDialog({ order, onClose }: { order: RechargeOrder; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const estimatedActual = useMemo(() => {
    if (!order.feeRate) return null;
    const rate = parseFloat(order.feeRate);
    const base = parseFloat(String(order.amount));
    return (base * (1 - rate / 100)).toFixed(2);
  }, [order]);

  const [actualAmount, setActualAmount] = useState(estimatedActual ?? String(Number(order.amount).toFixed(2)));
  const [note, setNote] = useState(order.note ?? "");

  const update = useUpdateRechargeOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRechargeOrdersQueryKey({}) });
        toast({ title: "已确认充值", description: "账户余额已更新。" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "操作失败，请重试";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const handleApprove = () => {
    const val = parseFloat(actualAmount);
    if (isNaN(val) || val <= 0) {
      toast({ title: "请输入有效的实际到账金额", variant: "destructive" });
      return;
    }
    update.mutate({ id: order.id, data: { status: "completed", actualAmount: val.toFixed(2), note: note || null } });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>确认充值</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm space-y-0.5">
            <p className="text-muted-foreground text-xs">充值账户</p>
            <p className="font-medium">{order.accountName ?? `账户 #${order.accountId}`}</p>
            <p className="text-xs text-muted-foreground">申请金额：<span className="font-mono">${Number(order.amount).toFixed(2)}</span>
              {order.feeRate && <span className="ml-2 text-amber-600">手续费率 {order.feeRate}%</span>}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">实际到账金额（美元）<span className="text-destructive">*</span></Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={actualAmount}
              onChange={(e) => setActualAmount(e.target.value)}
              placeholder="0.00"
            />
            {estimatedActual && (
              <p className="text-xs text-muted-foreground px-1">按手续费率预估：<span className="font-mono text-green-600">${estimatedActual}</span></p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">备注（选填）</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="审批备注..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleApprove} disabled={update.isPending} className="bg-green-600 hover:bg-green-700">
            {update.isPending ? "处理中..." : "确认到账"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ order, onClose }: { order: RechargeOrder; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const update = useUpdateRechargeOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRechargeOrdersQueryKey({}) });
        toast({ title: "已拒绝充值申请" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "操作失败";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !update.isPending && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />拒绝充值申请
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
            <p className="font-medium">{order.accountName ?? `账户 #${order.accountId}`}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              申请金额：<span className="font-mono">${Number(order.amount).toFixed(2)}</span>
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">拒绝原因（选填）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="说明拒绝原因..."
              rows={2}
              disabled={update.isPending}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>取消</Button>
          <Button
            variant="destructive"
            onClick={() => update.mutate({ id: order.id, data: { status: "rejected", note: note || null } })}
            disabled={update.isPending}
            className="gap-1.5"
          >
            {update.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />处理中...</> : "确认拒绝"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProviderRechargeOrdersPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [approveTarget, setApproveTarget] = useState<RechargeOrder | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RechargeOrder | null>(null);

  const apiParams: Record<string, string> = {};
  if (dateRange.from) apiParams.dateFrom = dateRange.from;
  if (dateRange.to) apiParams.dateTo = dateRange.to;

  const { data, isLoading } = useListRechargeOrders(apiParams);

  const allOrders = Array.isArray(data) ? (data as RechargeOrder[]) : [];

  const filtered = useMemo(() => {
    let rows = allOrders;
    if (statusFilter !== "all") rows = rows.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((o) => (o.accountName ?? "").toLowerCase().includes(q));
    }
    return rows;
  }, [allOrders, statusFilter, search]);

  const paged = usePagination(filtered, PAGE_SIZE, page);

  const totalAmount = filtered.reduce((s, o) => s + Number(o.amount), 0);
  const totalActual = filtered.filter((o) => o.actualAmount).reduce((s, o) => s + Number(o.actualAmount), 0);
  const pendingCount = filtered.filter((o) => o.status === "pending").length;
  const completedCount = filtered.filter((o) => o.status === "completed").length;
  const rejectedCount = filtered.filter((o) => o.status === "rejected").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">充值订单</h1>
        <p className="text-sm text-muted-foreground mt-0.5">审核并处理投手提交的充值申请</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 w-52 text-sm" placeholder="搜索账户名称..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center rounded-md border border-border overflow-hidden h-8">
          {[
            { value: "all", label: "全部" },
            { value: "pending", label: "待审核" },
            { value: "completed", label: "已完成" },
            { value: "rejected", label: "已拒绝" },
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
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">提交时间</span>
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => { setDateRange((r) => ({ ...r, from: e.target.value })); setPage(1); }}
            className="h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => { setDateRange((r) => ({ ...r, to: e.target.value })); setPage(1); }}
            className="h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {(dateRange.from || dateRange.to) && (
            <button
              onClick={() => { setDateRange({ from: "", to: "" }); setPage(1); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              清除
            </button>
          )}
        </div>
      </div>

      <StatsBar items={[
        { label: "申请总额", value: `$${totalAmount.toFixed(2)}`, color: "blue" },
        { label: "实际到账", value: `$${totalActual.toFixed(2)}`, color: "green" },
        { label: "待审核", value: pendingCount, color: pendingCount > 0 ? "amber" : "default" },
        { label: "已完成", value: completedCount, color: "green" },
        { label: "已拒绝", value: rejectedCount, color: rejectedCount > 0 ? "red" : "default" },
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>账户</TableHead>
              <TableHead className="text-right">申请金额</TableHead>
              <TableHead className="text-right">实际到账</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="w-24">提交时间</TableHead>
              <TableHead className="w-28">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={6}><EmptyState icon={Receipt} title="暂无充值订单" description="调整筛选条件或等待投手提交充值申请。" /></TableCell></TableRow>
            )}
            {!isLoading && paged.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium max-w-[180px]">
                  <TruncatedCell value={o.accountName ?? `账户 #${o.accountId}`} />
                </TableCell>
                <TableCell className="font-mono font-semibold text-right whitespace-nowrap">${Number(o.amount).toFixed(2)}</TableCell>
                <TableCell className="font-mono text-sm text-right whitespace-nowrap">
                  {o.actualAmount
                    ? <span className="text-green-600 font-medium">${Number(o.actualAmount).toFixed(2)}</span>
                    : o.status === "completed"
                      ? <span className="font-mono">${Number(o.amount).toFixed(2)}</span>
                      : <span className="text-muted-foreground">—</span>
                  }
                </TableCell>
                <TableCell><RechargeStatusBadge status={o.status} /></TableCell>
                <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{new Date(o.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                <TableCell>
                  {o.status === "pending" && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-500/15" onClick={() => setApproveTarget(o)} title="确认">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/15" onClick={() => setRejectTarget(o)} title="拒绝">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>

      {approveTarget && <ApproveDialog order={approveTarget} onClose={() => setApproveTarget(null)} />}
      {rejectTarget && <RejectDialog order={rejectTarget} onClose={() => setRejectTarget(null)} />}
    </div>
  );
}
