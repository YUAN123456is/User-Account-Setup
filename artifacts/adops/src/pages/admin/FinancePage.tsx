import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListRechargeOrders, useUpdateRechargeOrder, getListRechargeOrdersQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RechargeStatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateRangePicker, type DateRange } from "@/components/shared/DateRangePicker";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { Check, X, Wallet, Search } from "lucide-react";

interface RechargeOrder {
  id: number;
  accountId: number;
  accountName?: string;
  amount: string | number;
  providerName?: string;
  pitcherName?: string;
  status: "pending" | "completed" | "rejected";
  createdAt: string;
}

const PAGE_SIZE = 20;

export default function FinancePage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const apiParams: Record<string, string> = {};
  if (statusFilter !== "all") apiParams.status = statusFilter;
  if (dateRange.from) apiParams.dateFrom = dateRange.from;
  if (dateRange.to) apiParams.dateTo = dateRange.to;

  const { data, isLoading } = useListRechargeOrders(apiParams);
  const update = useUpdateRechargeOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRechargeOrdersQueryKey({}) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      },
    },
  });

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

  const paged = usePagination(filtered, PAGE_SIZE, page);

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
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="pending">待审核</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="rejected">已拒绝</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">提交时间</p>
        <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r); setPage(1); }} />
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
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={7}><EmptyState icon={Wallet} title="暂无充值订单" description="调整筛选条件或等待投手提交充值申请。" /></TableCell></TableRow>
            )}
            {!isLoading && paged.map((o) => (
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
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-500/15" onClick={() => update.mutate({ id: o.id, data: { status: "completed" } })} disabled={update.isPending} title="确认">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/15" onClick={() => update.mutate({ id: o.id, data: { status: "rejected" } })} disabled={update.isPending} title="拒绝">
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
    </div>
  );
}
