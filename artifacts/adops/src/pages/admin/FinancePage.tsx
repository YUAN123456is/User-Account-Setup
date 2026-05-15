import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListRechargeOrders, useUpdateRechargeOrder, getListRechargeOrdersQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RechargeStatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { QuickDateFilter, type DateRange } from "@/components/shared/QuickDateFilter";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Wallet, Search, ChevronsUpDown, ChevronUp, ChevronDown, Loader2, AlertTriangle } from "lucide-react";
import { TruncatedCell } from "@/components/shared/TruncatedCell";

interface RechargeOrder {
  id: number;
  accountId: number;
  accountName?: string;
  amount: string | number;
  actualAmount?: string | null;
  feeRate?: string | null;
  providerName?: string;
  pitcherName?: string;
  note?: string | null;
  status: "pending" | "completed" | "rejected";
  createdAt: string;
}

const PAGE_SIZE = 20;

function ApproveDialog({ order, onClose }: { order: RechargeOrder; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const estimated = useMemo(() => {
    if (!order.feeRate) return null;
    const rate = parseFloat(String(order.feeRate));
    const base = parseFloat(String(order.amount));
    return (base * (1 - rate / 100)).toFixed(2);
  }, [order]);

  const [actualAmount, setActualAmount] = useState(estimated ?? String(Number(order.amount).toFixed(2)));
  const [note, setNote] = useState(order.note ?? "");

  const update = useUpdateRechargeOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRechargeOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "已确认充值", description: "账户余额已更新。" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "操作失败";
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
    <Dialog open onOpenChange={(o) => !o && !update.isPending && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>确认充值到账</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm space-y-0.5">
            <p className="text-xs text-muted-foreground">充值账户</p>
            <p className="font-medium">{order.accountName ?? `账户 #${order.accountId}`}</p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
              <span>申请金额：<span className="font-mono text-foreground">${Number(order.amount).toFixed(2)}</span></span>
              {order.feeRate && <span className="text-amber-600">手续费率 {order.feeRate}%</span>}
              {order.pitcherName && <span>投手：{order.pitcherName}</span>}
              {order.providerName && <span>开户商：{order.providerName}</span>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">实际到账金额（美元）<span className="text-destructive">*</span></Label>
            <Input
              type="number" min="0.01" step="0.01"
              value={actualAmount}
              onChange={(e) => setActualAmount(e.target.value)}
              placeholder="0.00"
              disabled={update.isPending}
            />
            {estimated && (
              <p className="text-xs text-muted-foreground px-1">
                按手续费率预估：<span className="font-mono text-green-600">${estimated}</span>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">备注（选填）</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="审批备注..."
              rows={2}
              disabled={update.isPending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>取消</Button>
          <Button onClick={handleApprove} disabled={update.isPending} className="bg-green-600 hover:bg-green-700 text-white border-0 gap-1.5">
            {update.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />处理中...</> : "确认到账"}
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
        queryClient.invalidateQueries({ queryKey: getListRechargeOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
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
        <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />拒绝充值申请</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
            <p className="font-medium">{order.accountName ?? `账户 #${order.accountId}`}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              申请金额：<span className="font-mono">${Number(order.amount).toFixed(2)}</span>
              {order.pitcherName && <span className="ml-2">投手：{order.pitcherName}</span>}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">拒绝原因（选填）</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="说明拒绝原因..."
              rows={2}
              disabled={update.isPending}
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

export default function FinancePage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [approveTarget, setApproveTarget] = useState<RechargeOrder | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RechargeOrder | null>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };
  const queryClient = useQueryClient();

  const apiParams: Record<string, string> = {};
  if (statusFilter !== "all") apiParams.status = statusFilter;
  if (dateRange.from) apiParams.dateFrom = dateRange.from;
  if (dateRange.to) apiParams.dateTo = dateRange.to;

  const { data, isLoading } = useListRechargeOrders(apiParams);

  const allOrders = Array.isArray(data) ? (data as RechargeOrder[]) : [];

  const filtered = useMemo(() => {
    if (!search.trim()) return allOrders;
    const q = search.toLowerCase();
    return allOrders.filter((o) =>
      (o.accountName ?? "").toLowerCase().includes(q) ||
      (o.pitcherName ?? "").toLowerCase().includes(q) ||
      (o.providerName ?? "").toLowerCase().includes(q)
    );
  }, [allOrders, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "amount") return sortDir === "asc" ? Number(a.amount) - Number(b.amount) : Number(b.amount) - Number(a.amount);
      const sa = String((a as unknown as Record<string, unknown>)[sortKey] ?? "");
      const sb = String((b as unknown as Record<string, unknown>)[sortKey] ?? "");
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }, [filtered, sortKey, sortDir]);

  const paged = usePagination(sorted, PAGE_SIZE, page);

  const totalAmount = filtered.reduce((s, o) => s + Number(o.amount), 0);
  const pendingCount = filtered.filter((o) => o.status === "pending").length;
  const completedOrders = filtered.filter((o) => o.status === "completed");
  const approvedAmount = completedOrders.reduce((s, o) => s + Number(o.amount), 0);
  const completedAmount = completedOrders.reduce((s, o) => s + Number(o.actualAmount ?? o.amount), 0);
  const rejectedCount = filtered.filter((o) => o.status === "rejected").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">财务管理</h1>
        <p className="text-sm text-muted-foreground mt-0.5">处理充值订单</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 w-56 text-sm" placeholder="搜索账户/投手/开户商..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center rounded-md border border-border overflow-hidden h-8">
          {[
            { value: "all", label: "全部" },
            { value: "pending", label: "待审核" },
            { value: "completed", label: "已完成" },
            { value: "rejected", label: "已拒绝" },
          ].map((opt, i, arr) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1); }}
              className={[
                "px-3 h-full text-xs font-medium transition-colors",
                i < arr.length - 1 ? "border-r border-border" : "",
                statusFilter === opt.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <QuickDateFilter onChange={(r) => { setDateRange(r); setPage(1); }} />
        </div>
      </div>

      <StatsBar items={[
        { label: "充值总额（当前筛选）", value: `$${totalAmount.toFixed(2)}`, color: "blue" },
        { label: "已通过充值金额", value: `$${approvedAmount.toFixed(2)}`, color: "green" },
        { label: "实际到账（已完成）", value: `$${completedAmount.toFixed(2)}`, color: "green" },
        { label: "待审核笔数", value: pendingCount, color: pendingCount > 0 ? "amber" : "default" },
        { label: "已拒绝笔数", value: rejectedCount, color: rejectedCount > 0 ? "red" : "default" },
        { label: "总订单数", value: filtered.length },
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
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
                      {right && icon}{label}{!right && icon}
                    </span>
                  </TableHead>
                );
              };
              return (
                <TableRow className="bg-muted/40">
                  <SortHead col="accountName" label="账户" />
                  <SortHead col="amount" label="申请金额" className="text-right" right />
                  <TableHead className="text-right whitespace-nowrap">实际到账</TableHead>
                  <SortHead col="providerName" label="开户商" />
                  <SortHead col="pitcherName" label="投手" />
                  <SortHead col="status" label="状态" className="w-24" />
                  <SortHead col="createdAt" label="提交时间" className="w-24" />
                  <TableHead className="w-28">操作</TableHead>
                </TableRow>
              );
            })()}
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={8}><EmptyState icon={Wallet} title="暂无充值订单" description="调整筛选条件或等待投手提交充值申请。" /></TableCell></TableRow>
            )}
            {!isLoading && paged.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium max-w-[160px]">
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
                <TableCell className="text-muted-foreground text-sm max-w-[100px]">
                  {o.providerName ? <TruncatedCell value={o.providerName} /> : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm max-w-[100px]">
                  {o.pitcherName ? <TruncatedCell value={o.pitcherName} /> : "—"}
                </TableCell>
                <TableCell><RechargeStatusBadge status={o.status} /></TableCell>
                <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{new Date(o.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                <TableCell>
                  {o.status === "pending" && (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-green-600 hover:bg-green-500/15"
                        onClick={() => setApproveTarget(o)}
                        title="确认到账"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/15"
                        onClick={() => setRejectTarget(o)}
                        title="拒绝"
                      >
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
