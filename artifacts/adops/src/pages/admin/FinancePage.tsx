import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListRechargeOrders, useUpdateRechargeOrder, getListRechargeOrdersQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RechargeStatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Check, X, Wallet } from "lucide-react";

interface RechargeOrder {
  id: number;
  accountId: number;
  accountName?: string;
  amount: string | number;
  providerId?: number;
  providerName?: string;
  pitcherId?: number;
  pitcherName?: string;
  status: "pending" | "completed" | "rejected";
  note?: string;
  createdAt: string;
}

export default function FinancePage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const queryClient = useQueryClient();

  const params: Record<string, string> = {};
  if (statusFilter !== "all") params.status = statusFilter;

  const { data, isLoading } = useListRechargeOrders(params);
  const update = useUpdateRechargeOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRechargeOrdersQueryKey({}) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      },
    },
  });
  const orders = Array.isArray(data) ? (data as RechargeOrder[]) : [];

  const handleAction = (id: number, status: "completed" | "rejected") => {
    update.mutate({ id, data: { status } });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">财务管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">处理充值订单</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="pending">待审核</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="rejected">已拒绝</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>账户</TableHead>
              <TableHead>充值金额</TableHead>
              <TableHead>开户商</TableHead>
              <TableHead>投手</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>提交时间</TableHead>
              <TableHead className="w-28">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && orders.length === 0 && (
              <TableRow><TableCell colSpan={7}>
                <EmptyState icon={Wallet} title="暂无充值订单" description="投手提交充值申请后将在此显示。" />
              </TableCell></TableRow>
            )}
            {!isLoading && orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.accountName ?? `账户 #${o.accountId}`}</TableCell>
                <TableCell className="font-mono font-semibold">${Number(o.amount).toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{o.providerName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{o.pitcherName ?? "—"}</TableCell>
                <TableCell><RechargeStatusBadge status={o.status} /></TableCell>
                <TableCell className="text-muted-foreground text-sm">{new Date(o.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                <TableCell>
                  {o.status === "pending" && (
                    <div className="flex gap-1">
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-green-600 hover:bg-green-500/15 hover:text-green-600"
                        onClick={() => handleAction(o.id, "completed")}
                        disabled={update.isPending}
                        title="确认"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/15 hover:text-destructive"
                        onClick={() => handleAction(o.id, "rejected")}
                        disabled={update.isPending}
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
      </div>
    </div>
  );
}
