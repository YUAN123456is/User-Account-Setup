import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAccounts,
  useCreateRechargeOrder,
  useListRechargeOrders,
  useUpdateRechargeOrder,
  getListRechargeOrdersQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RechargeStatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, History, Pencil } from "lucide-react";

interface Account { id: number; accountName: string; platform: string; }
interface RechargeOrder {
  id: number;
  accountName?: string;
  amount: string;
  status: "pending" | "completed" | "rejected";
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

function EditAmountDialog({
  order,
  onClose,
}: {
  order: RechargeOrder;
  onClose: () => void;
}) {
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
    update.mutate({
      id: order.id,
      data: { amount: val.toFixed(2), note: note || null },
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>修改充值金额</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs mb-0.5">充值账户</p>
            <p className="font-medium">{order.accountName ?? `订单 #${order.id}`}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              原金额：<span className="font-mono">${Number(order.amount).toFixed(2)}</span>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">
              新充值金额（美元）<span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">备注（选填）</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="说明修改原因..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "保存中..." : "确认修改"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RechargeRequestPage() {
  const [form, setForm] = useState({ accountId: "", amount: "", note: "" });
  const [editTarget, setEditTarget] = useState<RechargeOrder | null>(null);
  const queryClient = useQueryClient();
  const { data: accountsData } = useListAccounts({});
  const { data: ordersData, isLoading: ordersLoading } = useListRechargeOrders({} as Record<string, string>);
  const accounts = Array.isArray(accountsData) ? (accountsData as Account[]) : [];
  const allOrders = Array.isArray(ordersData) ? (ordersData as RechargeOrder[]) : [];
  const { toast } = useToast();

  const sortedOrders = useMemo(
    () => [...allOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allOrders],
  );

  const create = useCreateRechargeOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRechargeOrdersQueryKey({}) });
        toast({ title: "充值申请已提交", description: "请等待开户商审核处理。" });
        setForm({ accountId: "", amount: "", note: "" });
      },
      onError: () => {
        toast({ title: "提交失败", description: "请稍后重试。", variant: "destructive" });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountId || !form.amount) {
      toast({ title: "请填写完整", description: "账户和充值金额为必填项。", variant: "destructive" });
      return;
    }
    create.mutate({
      data: {
        accountId: Number(form.accountId),
        amount: form.amount,
        note: form.note || undefined,
      },
    });
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">申请充值</h1>
        <p className="text-sm text-muted-foreground mt-0.5">向开户商提交账户充值申请，并查看历史申请状态</p>
      </div>

      <Card className="max-w-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-primary" />
            新建充值申请
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">选择账户 <span className="text-destructive">*</span></Label>
              <Select value={form.accountId} onValueChange={(v) => setForm({ ...form, accountId: v })}>
                <SelectTrigger><SelectValue placeholder="请选择账户..." /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.accountName}（{a.platform}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">充值金额（美元）<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">备注（选填）</Label>
              <Textarea
                placeholder="向开户商说明充值用途..."
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={3}
              />
            </div>

            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? "提交中..." : "提交申请"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Recharge history */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          我的充值申请记录
        </h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>账户</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>备注</TableHead>
                <TableHead>申请时间</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordersLoading && Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
                  ))}
                </TableRow>
              ))}
              {!ordersLoading && sortedOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                    暂无充值申请记录
                  </TableCell>
                </TableRow>
              )}
              {!ordersLoading && sortedOrders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium text-sm max-w-[160px] truncate" title={o.accountName}>
                    {o.accountName ?? `账户 #${o.id}`}
                  </TableCell>
                  <TableCell className="font-mono">${Number(o.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate" title={o.note ?? ""}>
                    {o.note || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(o.updatedAt).toLocaleDateString("zh-CN")}
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
      </div>

      {editTarget && (
        <EditAmountDialog order={editTarget} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}
