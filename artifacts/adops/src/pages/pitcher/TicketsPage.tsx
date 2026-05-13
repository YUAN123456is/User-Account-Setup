import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTickets,
  useCreateTicket,
  useListProviders,
  getListTicketsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { TicketIcon, Plus, Search, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 20;

interface Ticket {
  id: number;
  type: "new_account" | "rebind_bm";
  status: "pending" | "completed";
  providerId: number;
  providerName?: string | null;
  platform?: string | null;
  amount?: string | null;
  targetBm?: string | null;
  account?: string | null;
  remark?: string | null;
  completedNote?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

function TicketTypeBadge({ type }: { type: string }) {
  return type === "new_account"
    ? <Badge variant="outline" className="text-blue-600 border-blue-400 bg-blue-500/10 text-xs">开新户</Badge>
    : <Badge variant="outline" className="text-purple-600 border-purple-400 bg-purple-500/10 text-xs">换绑BM</Badge>;
}

function TicketStatusBadge({ status }: { status: string }) {
  return status === "completed"
    ? <Badge variant="outline" className="text-green-600 border-green-400 bg-green-500/10 text-xs">已完成</Badge>
    : <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-500/10 text-xs">处理中</Badge>;
}

function SubmitDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: providersData } = useListProviders();
  const providers = Array.isArray(providersData)
    ? (providersData as { id: number; displayName: string }[])
    : [];

  const [type, setType] = useState<"new_account" | "rebind_bm">("new_account");
  const [providerId, setProviderId] = useState("");
  const [platform, setPlatform] = useState("");
  const [amount, setAmount] = useState("");
  const [targetBm, setTargetBm] = useState("");
  const [account, setAccount] = useState("");
  const [remark, setRemark] = useState("");

  const create = useCreateTicket({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey({}) });
        toast({ title: "工单已提交", description: "等待开户商处理。" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "提交失败，请重试";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const handleSubmit = () => {
    if (!providerId) { toast({ title: "请选择开户商", variant: "destructive" }); return; }
    if (type === "new_account") {
      if (!platform) { toast({ title: "请选择投放平台", variant: "destructive" }); return; }
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { toast({ title: "请输入有效的初始金额", variant: "destructive" }); return; }
    } else {
      if (!targetBm.trim()) { toast({ title: "请填写目标BM", variant: "destructive" }); return; }
      if (!account.trim()) { toast({ title: "请填写账户信息", variant: "destructive" }); return; }
    }
    create.mutate({
      data: {
        type,
        providerId: Number(providerId),
        platform: type === "new_account" ? platform : null,
        amount: type === "new_account" ? amount : null,
        targetBm: type === "rebind_bm" ? targetBm : null,
        account: type === "rebind_bm" ? account : null,
        remark: remark || null,
      },
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !create.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>提交工单</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>工单类型 <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              {(["new_account", "rebind_bm"] as const).map((t) => (
                <button key={t} onClick={() => setType(t)}
                  className={["flex-1 py-2 rounded-md border text-sm font-medium transition-colors",
                    type === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  {t === "new_account" ? "开新户" : "换绑BM"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>开户商 <span className="text-destructive">*</span></Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger><SelectValue placeholder="选择开户商..." /></SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "new_account" && (
            <>
              <div className="space-y-1.5">
                <Label>投放平台 <span className="text-destructive">*</span></Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger><SelectValue placeholder="选择平台..." /></SelectTrigger>
                  <SelectContent>
                    {["FB", "GG", "TT", "TW", "OTHER"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>初始金额（美元）<span className="text-destructive">*</span></Label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
            </>
          )}

          {type === "rebind_bm" && (
            <>
              <div className="space-y-1.5">
                <Label>目标BM <span className="text-destructive">*</span></Label>
                <Input value={targetBm} onChange={(e) => setTargetBm(e.target.value)} placeholder="BM ID 或名称..." />
              </div>
              <div className="space-y-1.5">
                <Label>账户（每行一个）<span className="text-destructive">*</span></Label>
                <Textarea value={account} onChange={(e) => setAccount(e.target.value)} placeholder="账户ID或名称，每行一个..." rows={3} />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>备注（选填）</Label>
            <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="补充说明..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>取消</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? "提交中..." : "提交工单"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistorySection({ tickets }: { tickets: Ticket[] }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const paged = usePagination(tickets, PAGE_SIZE, page);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-medium"
      >
        <span>历史工单（{tickets.length}）</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead>类型</TableHead>
                <TableHead>开户商</TableHead>
                <TableHead>详情</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>完成备注</TableHead>
                <TableHead className="w-24">提交时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-6">暂无历史工单</TableCell></TableRow>
              )}
              {paged.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><TicketTypeBadge type={t.type} /></TableCell>
                  <TableCell className="text-sm">{t.providerName ?? `#${t.providerId}`}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                    {t.type === "new_account"
                      ? <span>{t.platform} · ${t.amount}</span>
                      : <span className="truncate block">BM: {t.targetBm}</span>
                    }
                    {t.remark && <span className="block text-muted-foreground/70 truncate">备注: {t.remark}</span>}
                  </TableCell>
                  <TableCell><TicketStatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.completedNote ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={PAGE_SIZE} total={tickets.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

export default function TicketsPage() {
  const [showSubmit, setShowSubmit] = useState(false);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [pendingPage, setPendingPage] = useState(1);

  const apiParams: Record<string, string> = {};
  if (dateRange.from) apiParams.dateFrom = dateRange.from;
  if (dateRange.to) apiParams.dateTo = dateRange.to;

  const { data, isLoading } = useListTickets(apiParams);
  const allTickets = Array.isArray(data) ? (data as Ticket[]) : [];

  const pending = allTickets.filter((t) => t.status === "pending");
  const completed = allTickets.filter((t) => t.status === "completed");

  const filteredPending = useMemo(() => {
    if (!search.trim()) return pending;
    const q = search.toLowerCase();
    return pending.filter((t) =>
      (t.providerName ?? "").toLowerCase().includes(q) ||
      (t.remark ?? "").toLowerCase().includes(q) ||
      (t.targetBm ?? "").toLowerCase().includes(q) ||
      (t.platform ?? "").toLowerCase().includes(q)
    );
  }, [pending, search]);

  const filteredCompleted = useMemo(() => {
    if (!search.trim()) return completed;
    const q = search.toLowerCase();
    return completed.filter((t) =>
      (t.providerName ?? "").toLowerCase().includes(q) ||
      (t.remark ?? "").toLowerCase().includes(q) ||
      (t.targetBm ?? "").toLowerCase().includes(q) ||
      (t.platform ?? "").toLowerCase().includes(q)
    );
  }, [completed, search]);

  const pagedPending = usePagination(filteredPending, PAGE_SIZE, pendingPage);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">提交工单</h1>
          <p className="text-sm text-muted-foreground mt-0.5">向开户商提交开新户或换绑BM申请</p>
        </div>
        <Button onClick={() => setShowSubmit(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />提交工单
        </Button>
      </div>

      <StatsBar items={[
        { label: "全部工单", value: allTickets.length, color: "blue" },
        { label: "处理中", value: pending.length, color: pending.length > 0 ? "amber" : "default" },
        { label: "已完成", value: completed.length, color: "green" },
      ]} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-8 w-48 text-sm"
            placeholder="搜索开户商/备注..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPendingPage(1); }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">提交时间</span>
          <input type="date" value={dateRange.from}
            onChange={(e) => { setDateRange((r) => ({ ...r, from: e.target.value })); setPendingPage(1); }}
            className="h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input type="date" value={dateRange.to}
            onChange={(e) => { setDateRange((r) => ({ ...r, to: e.target.value })); setPendingPage(1); }}
            className="h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {(dateRange.from || dateRange.to || search) && (
            <button
              onClick={() => { setDateRange({ from: "", to: "" }); setSearch(""); setPendingPage(1); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              清除
            </button>
          )}
        </div>
      </div>

      {/* Pending tickets */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">处理中的工单</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>类型</TableHead>
                <TableHead>开户商</TableHead>
                <TableHead>详情</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-24">提交时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((__, j) => (
                  <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
                ))}</TableRow>
              ))}
              {!isLoading && pagedPending.length === 0 && (
                <TableRow><TableCell colSpan={5}>
                  <EmptyState icon={TicketIcon} title="暂无处理中的工单" description="点击右上角【提交工单】创建新申请。" />
                </TableCell></TableRow>
              )}
              {!isLoading && pagedPending.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><TicketTypeBadge type={t.type} /></TableCell>
                  <TableCell className="text-sm">{t.providerName ?? `#${t.providerId}`}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                    {t.type === "new_account"
                      ? <span>{t.platform} · 初始金额 ${t.amount}</span>
                      : <span className="truncate block">BM: {t.targetBm}</span>
                    }
                    {t.remark && <span className="block text-muted-foreground/70 truncate">备注: {t.remark}</span>}
                  </TableCell>
                  <TableCell><TicketStatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={pendingPage} pageSize={PAGE_SIZE} total={filteredPending.length} onPageChange={setPendingPage} />
        </div>
      </div>

      {/* History (completed, collapsed by default) */}
      <HistorySection tickets={filteredCompleted} />

      {showSubmit && <SubmitDialog onClose={() => setShowSubmit(false)} />}
    </div>
  );
}
