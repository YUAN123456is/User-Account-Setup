import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListAccounts, useListUsers, useAssignAccount, getListAccountsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PlatformBadge } from "@/components/shared/StatusBadge";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { useToast } from "@/hooks/use-toast";
import { Search, UserCheck, Inbox } from "lucide-react";

interface Account {
  id: number;
  platformAccountId: string;
  accountName: string;
  platform: string;
  status: "idle" | "active" | "banned";
  pitcherId: number | null;
  currentBalance: string;
  createdAt: string;
}

interface PitcherUser {
  id: number;
  displayName: string;
  role: string;
}

const PAGE_SIZE = 20;

function AssignDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState(String(user?.id ?? ""));

  const { data: usersData } = useListUsers({ role: "pitcher" });
  const pitchers = useMemo(() => {
    const all = Array.isArray(usersData) ? (usersData as PitcherUser[]) : [];
    return all.filter((p) => p.role === "pitcher");
  }, [usersData]);

  const assign = useAssignAccount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
        const target = pitchers.find((p) => p.id === Number(targetId));
        toast({ title: "分配成功", description: `账户已分配给「${target?.displayName ?? "投手"}」` });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "分配失败，请重试";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

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
            <Label className="text-sm">分配给 <span className="text-destructive">*</span></Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger>
                <SelectValue placeholder="选择投手..." />
              </SelectTrigger>
              <SelectContent>
                {pitchers.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.displayName}{p.id === user?.id ? "（我自己）" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            onClick={() => assign.mutate({ id: account.id, data: { pitcherId: Number(targetId) } })}
            disabled={assign.isPending || !targetId}
          >
            {assign.isPending ? "分配中..." : "确认分配"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PitcherPoolPage() {
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [assignTarget, setAssignTarget] = useState<Account | null>(null);

  const { data, isLoading } = useListAccounts({});
  const allAccounts = Array.isArray(data) ? (data as unknown as Account[]) : [];

  const poolAccounts = allAccounts.filter((a) => a.pitcherId === null);

  const filtered = useMemo(() => {
    let rows = poolAccounts;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((a) =>
        a.accountName.toLowerCase().includes(q) ||
        a.platformAccountId.toLowerCase().includes(q)
      );
    }
    if (platformFilter !== "all") rows = rows.filter((a) => a.platform === platformFilter);
    return rows;
  }, [poolAccounts, search, platformFilter]);

  const paged = usePagination(filtered, PAGE_SIZE, page);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">账户分配</h1>
        <p className="text-sm text-muted-foreground mt-0.5">将空闲账户分配给您自己或其他投手</p>
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
        <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部平台</SelectItem>
            {["FB", "GG", "TT", "TW", "OTHER"].map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <StatsBar items={[
        { label: "待分配账户", value: poolAccounts.length, color: poolAccounts.length > 0 ? "amber" : "default" },
        { label: "筛选结果", value: filtered.length },
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>账户名称</TableHead>
              <TableHead>平台账户ID</TableHead>
              <TableHead>平台</TableHead>
              <TableHead>余额</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
                ))}
              </TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <p className="text-sm font-medium">暂无待分配账户</p>
                    <p className="text-xs">所有账户已分配，或请联系管理员添加新账户</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!isLoading && paged.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium max-w-[160px]">
                  <TruncatedCell value={a.accountName} />
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground max-w-[140px]">
                  <TruncatedCell value={a.platformAccountId} />
                </TableCell>
                <TableCell><PlatformBadge platform={a.platform} /></TableCell>
                <TableCell className="font-mono">${Number(a.currentBalance).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(a.createdAt).toLocaleDateString("zh-CN")}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => setAssignTarget(a)}
                  >
                    <UserCheck className="h-3.5 w-3.5" /> 分配
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>

      {assignTarget && (
        <AssignDialog account={assignTarget} onClose={() => setAssignTarget(null)} />
      )}
    </div>
  );
}
