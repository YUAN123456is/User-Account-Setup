import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListAccounts, useListUsers, useAssignAccount, getListAccountsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountStatusBadge, PlatformBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { CreditCard, UserPlus } from "lucide-react";

interface Account {
  id: number;
  platformAccountId: string;
  accountName: string;
  platform: string;
  providerId: number | null;
  pitcherId?: number | null;
  status: "idle" | "active" | "banned";
  currentBalance: string;
  lastReportedAt?: string | null;
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
        <div className="py-2 space-y-1.5">
          <Select value={pitcherId} onValueChange={setPitcherId}>
            <SelectTrigger><SelectValue placeholder="选择投手..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不分配（取消）</SelectItem>
              {pitchers.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>
              ))}
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

export default function AccountsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignAccount, setAssignAccount] = useState<Account | null>(null);

  const params: Record<string, string> = {};
  if (statusFilter !== "all") params.status = statusFilter;
  const { data, isLoading } = useListAccounts(params);
  const accounts = Array.isArray(data) ? (data as unknown as Account[]) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">账户管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理各平台广告账户</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="idle">空闲</SelectItem>
            <SelectItem value="active">运行中</SelectItem>
            <SelectItem value="banned">已封禁</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
              <TableHead className="w-20">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 9 }).map((__, j) => (
                  <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
                ))}
              </TableRow>
            ))}
            {!isLoading && accounts.length === 0 && (
              <TableRow><TableCell colSpan={9}>
                <EmptyState icon={CreditCard} title="暂无账户" description="账户数据将在此处显示。" />
              </TableCell></TableRow>
            )}
            {!isLoading && accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium max-w-[180px] truncate">{a.accountName}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">{a.platformAccountId}</TableCell>
                <TableCell><PlatformBadge platform={a.platform} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{a.providerName ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{a.pitcherName ?? <span className="text-amber-500 text-xs">未分配</span>}</TableCell>
                <TableCell><AccountStatusBadge status={a.status} /></TableCell>
                <TableCell className="font-mono text-sm">${Number(a.currentBalance).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {a.lastReportedAt ? new Date(a.lastReportedAt).toLocaleDateString("zh-CN") : "—"}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAssignAccount(a)}>
                    <UserPlus className="h-3.5 w-3.5" /> 分配
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {assignAccount && <AssignDialog account={assignAccount} onClose={() => setAssignAccount(null)} />}
    </div>
  );
}
