import { useQueryClient } from "@tanstack/react-query";
import { useListRechargeOrders, useUpdateRechargeOrder, getListRechargeOrdersQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RechargeStatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Check, X, Receipt } from "lucide-react";

interface RechargeOrder {
  id: number;
  accountId: number;
  accountName?: string;
  amount: string | number;
  pitcherName?: string;
  status: "pending" | "completed" | "rejected";
  createdAt: string;
}

export default function ProviderRechargeOrdersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListRechargeOrders({});
  const update = useUpdateRechargeOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRechargeOrdersQueryKey({}) });
      },
    },
  });
  const orders = Array.isArray(data) ? (data as RechargeOrder[]) : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">充值订单</h1>
        <p className="text-sm text-muted-foreground mt-0.5">审核并处理投手提交的充值申请</p>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>账户</TableHead>
              <TableHead>充值金额</TableHead>
              <TableHead>投手</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>提交时间</TableHead>
              <TableHead className="w-28">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && orders.length === 0 && (
              <TableRow><TableCell colSpan={6}>
                <EmptyState icon={Receipt} title="暂无充值订单" description="投手提交充值申请后将在此显示。" />
              </TableCell></TableRow>
            )}
            {!isLoading && orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.accountName ?? `账户 #${o.accountId}`}</TableCell>
                <TableCell className="font-mono font-semibold">${Number(o.amount).toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{o.pitcherName ?? "—"}</TableCell>
                <TableCell><RechargeStatusBadge status={o.status} /></TableCell>
                <TableCell className="text-muted-foreground text-sm">{new Date(o.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                <TableCell>
                  {o.status === "pending" && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-500/15"
                        onClick={() => update.mutate({ id: o.id, data: { status: "completed" } })}
                        disabled={update.isPending} title="确认">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/15"
                        onClick={() => update.mutate({ id: o.id, data: { status: "rejected" } })}
                        disabled={update.isPending} title="拒绝">
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
