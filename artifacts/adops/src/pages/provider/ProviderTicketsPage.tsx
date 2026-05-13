import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTickets,
  useCompleteTicket,
  getListTicketsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { TicketIcon, CheckCircle, Search, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 20;

interface Ticket {
  id: number;
  type: "new_account" | "rebind_bm";
  status: "pending" | "completed";
  pitcherId: number;
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

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium break-all whitespace-pre-wrap">{value ?? "—"}</span>
    </div>
  );
}

function TicketDetailDialog({ ticket, onClose, onComplete }: { ticket: Ticket; onClose: () => void; onComplete?: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TicketIcon className="h-4 w-4" />
            工单详情 #{ticket.id}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-2">
            <TicketTypeBadge type={ticket.type} />
            <Badge variant={ticket.status === "pending" ? "secondary" : "outline"} className={ticket.status === "completed" ? "text-green-600 border-green-400 bg-green-500/10 text-xs" : "text-xs"}>
              {ticket.status === "pending" ? "待处理" : "已完成"}
            </Badge>
          </div>

          <div className="rounded-lg border border-border p-4 space-y-3">
            {ticket.type === "new_account" ? (
              <>
                <DetailRow label="广告平台" value={ticket.platform} />
                <DetailRow label="初始充值金额（美元）" value={ticket.amount ? `$${ticket.amount}` : null} />
              </>
            ) : (
              <>
                <DetailRow label="目标 BM ID" value={ticket.targetBm} />
                <DetailRow label="需换绑的账户" value={ticket.account} />
              </>
            )}
            <DetailRow label="备注" value={ticket.remark} />
          </div>

          <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/20">
            <DetailRow label="提交时间" value={new Date(ticket.createdAt).toLocaleString("zh-CN")} />
            {ticket.status === "completed" && (
              <>
                <DetailRow label="完成时间" value={ticket.completedAt ? new Date(ticket.completedAt).toLocaleString("zh-CN") : null} />
                <DetailRow label="完成备注" value={ticket.completedNote} />
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>关闭</Button>
          {ticket.status === "pending" && onComplete && (
            <Button onClick={() => { onClose(); onComplete(); }} className="bg-green-600 hover:bg-green-700">
              标记完成
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const complete = useCompleteTicket({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey({}) });
        toast({ title: "工单已标记为完成" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "操作失败，请重试";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !complete.isPending && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-600" />标记工单完成</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2.5 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <TicketTypeBadge type={ticket.type} />
            </div>
            {ticket.type === "new_account" && (
              <p className="text-xs text-muted-foreground">平台: {ticket.platform} · 金额: ${ticket.amount}</p>
            )}
            {ticket.type === "rebind_bm" && (
              <>
                <p className="text-xs text-muted-foreground">目标BM: {ticket.targetBm}</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">账户: {ticket.account}</p>
              </>
            )}
            {ticket.remark && <p className="text-xs text-muted-foreground/70">备注: {ticket.remark}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">完成备注（选填）</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="填写处理结果或说明..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={complete.isPending}>取消</Button>
          <Button onClick={() => complete.mutate({ id: ticket.id, data: { completedNote: note || null } })} disabled={complete.isPending} className="bg-green-600 hover:bg-green-700">
            {complete.isPending ? "处理中..." : "确认完成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistorySection({ tickets }: { tickets: Ticket[] }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [viewTarget, setViewTarget] = useState<Ticket | null>(null);
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
                <TableHead>详情</TableHead>
                <TableHead>完成备注</TableHead>
                <TableHead className="w-24">完成时间</TableHead>
                <TableHead className="w-16">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">暂无历史工单</TableCell></TableRow>
              )}
              {paged.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><TicketTypeBadge type={t.type} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                    {t.type === "new_account"
                      ? <span>{t.platform} · ${t.amount}</span>
                      : <span className="truncate block">BM: {t.targetBm}</span>
                    }
                    {t.remark && <span className="block text-muted-foreground/70 truncate">备注: {t.remark}</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.completedNote ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {t.completedAt ? new Date(t.completedAt).toLocaleDateString("zh-CN") : "—"}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewTarget(t)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={PAGE_SIZE} total={tickets.length} onPageChange={setPage} />
        </>
      )}
      {viewTarget && <TicketDetailDialog ticket={viewTarget} onClose={() => setViewTarget(null)} />}
    </div>
  );
}

export default function ProviderTicketsPage() {
  const [completeTarget, setCompleteTarget] = useState<Ticket | null>(null);
  const [viewTarget, setViewTarget] = useState<Ticket | null>(null);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);

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
      (t.remark ?? "").toLowerCase().includes(q) ||
      (t.platform ?? "").toLowerCase().includes(q) ||
      (t.targetBm ?? "").toLowerCase().includes(q)
    );
  }, [pending, search]);

  const pagedPending = usePagination(filteredPending, PAGE_SIZE, page);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">工单管理</h1>
        <p className="text-sm text-muted-foreground mt-0.5">处理提交的开新户和换绑BM申请</p>
      </div>

      <StatsBar items={[
        { label: "待处理", value: pending.length, color: pending.length > 0 ? "amber" : "default" },
        { label: "已完成", value: completed.length, color: "green" },
        { label: "全部工单", value: allTickets.length, color: "blue" },
      ]} />

      {/* Pending tickets */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <h2 className="text-sm font-semibold">待处理工单</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-8 w-48 text-sm" placeholder="搜索备注或平台..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <div className="flex items-center gap-1.5">
              <input type="date" value={dateRange.from} onChange={(e) => { setDateRange((r) => ({ ...r, from: e.target.value })); setPage(1); }} className="h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring" />
              <span className="text-xs text-muted-foreground">—</span>
              <input type="date" value={dateRange.to} onChange={(e) => { setDateRange((r) => ({ ...r, to: e.target.value })); setPage(1); }} className="h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring" />
              {(dateRange.from || dateRange.to) && (
                <button onClick={() => { setDateRange({ from: "", to: "" }); setPage(1); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">清除</button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>类型</TableHead>
                <TableHead>详情</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="w-24">提交时间</TableHead>
                <TableHead className="w-28">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((__, j) => (
                  <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
                ))}</TableRow>
              ))}
              {!isLoading && pagedPending.length === 0 && (
                <TableRow><TableCell colSpan={5}>
                  <EmptyState icon={TicketIcon} title="暂无待处理工单" description="所有工单均已完成，或尚未有申请提交。" />
                </TableCell></TableRow>
              )}
              {!isLoading && pagedPending.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><TicketTypeBadge type={t.type} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                    {t.type === "new_account" ? (
                      <span>{t.platform} · 初始金额 ${t.amount}</span>
                    ) : (
                      <>
                        <span className="block">BM: {t.targetBm}</span>
                        <span className="block whitespace-pre-wrap text-muted-foreground/70 truncate max-w-[180px]">{t.account}</span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">{t.remark ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewTarget(t)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-400 hover:bg-green-500/10" onClick={() => setCompleteTarget(t)}>
                        完成
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={PAGE_SIZE} total={filteredPending.length} onPageChange={setPage} />
        </div>
      </div>

      {/* History */}
      <HistorySection tickets={completed} />

      {viewTarget && (
        <TicketDetailDialog
          ticket={viewTarget}
          onClose={() => setViewTarget(null)}
          onComplete={viewTarget.status === "pending" ? () => { setCompleteTarget(viewTarget); setViewTarget(null); } : undefined}
        />
      )}
      {completeTarget && <CompleteDialog ticket={completeTarget} onClose={() => setCompleteTarget(null)} />}
    </div>
  );
}
