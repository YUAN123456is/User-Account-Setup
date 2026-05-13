import { useState, useMemo } from "react";
import { useListTickets } from "@workspace/api-client-react";
import { useListUsers } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { TicketIcon, Search, ChevronDown, ChevronUp } from "lucide-react";

const PAGE_SIZE = 20;

interface Ticket {
  id: number;
  type: "new_account" | "rebind_bm";
  status: "pending" | "completed";
  pitcherId: number;
  pitcherName?: string | null;
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
        <span>历史工单（已完成 {tickets.length} 条）</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead>类型</TableHead>
                <TableHead>投手</TableHead>
                <TableHead>开户商</TableHead>
                <TableHead>详情</TableHead>
                <TableHead>完成备注</TableHead>
                <TableHead className="w-24">完成时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-6">暂无历史工单</TableCell></TableRow>
              )}
              {paged.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><TicketTypeBadge type={t.type} /></TableCell>
                  <TableCell className="text-sm">{t.pitcherName ?? `#${t.pitcherId}`}</TableCell>
                  <TableCell className="text-sm">{t.providerName ?? `#${t.providerId}`}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[180px]">
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

export default function AdminTicketsPage() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pitcherFilter, setPitcherFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);

  const apiParams: Record<string, string> = {};
  if (dateRange.from) apiParams.dateFrom = dateRange.from;
  if (dateRange.to) apiParams.dateTo = dateRange.to;

  const { data, isLoading } = useListTickets(apiParams);
  const { data: usersData } = useListUsers({});

  const allTickets = Array.isArray(data) ? (data as Ticket[]) : [];
  const allUsers = Array.isArray(usersData) ? (usersData as { id: number; displayName: string; role: string }[]) : [];
  const pitchers = allUsers.filter((u) => u.role === "pitcher");
  const providers = allUsers.filter((u) => u.role === "provider");

  const filtered = useMemo(() => {
    let rows = allTickets;
    if (typeFilter !== "all") rows = rows.filter((t) => t.type === typeFilter);
    if (statusFilter !== "all") rows = rows.filter((t) => t.status === statusFilter);
    if (pitcherFilter !== "all") rows = rows.filter((t) => t.pitcherId === Number(pitcherFilter));
    if (providerFilter !== "all") rows = rows.filter((t) => t.providerId === Number(providerFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((t) =>
        (t.pitcherName ?? "").toLowerCase().includes(q) ||
        (t.providerName ?? "").toLowerCase().includes(q) ||
        (t.remark ?? "").toLowerCase().includes(q) ||
        (t.targetBm ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [allTickets, typeFilter, statusFilter, pitcherFilter, providerFilter, search]);

  const pending = filtered.filter((t) => t.status === "pending");
  const completed = filtered.filter((t) => t.status === "completed");

  const pagedPending = usePagination(pending, PAGE_SIZE, page);

  const clearFilters = () => {
    setTypeFilter("all");
    setStatusFilter("all");
    setPitcherFilter("all");
    setProviderFilter("all");
    setSearch("");
    setDateRange({ from: "", to: "" });
    setPage(1);
  };

  const hasFilters = typeFilter !== "all" || statusFilter !== "all" || pitcherFilter !== "all" || providerFilter !== "all" || search || dateRange.from || dateRange.to;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">工单总览</h1>
        <p className="text-sm text-muted-foreground mt-0.5">查看所有投手提交的工单记录</p>
      </div>

      <StatsBar items={[
        { label: "全部工单", value: allTickets.length, color: "blue" },
        { label: "处理中", value: allTickets.filter((t) => t.status === "pending").length, color: allTickets.filter((t) => t.status === "pending").length > 0 ? "amber" : "default" },
        { label: "已完成", value: allTickets.filter((t) => t.status === "completed").length, color: "green" },
        { label: "开新户", value: allTickets.filter((t) => t.type === "new_account").length, color: "default" },
        { label: "换绑BM", value: allTickets.filter((t) => t.type === "rebind_bm").length, color: "default" },
      ]} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 w-48 text-sm" placeholder="搜索..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>

        <div className="flex items-center rounded-md border border-border overflow-hidden h-8">
          {[{ value: "all", label: "全部类型" }, { value: "new_account", label: "开新户" }, { value: "rebind_bm", label: "换绑BM" }].map((opt) => (
            <button key={opt.value} onClick={() => { setTypeFilter(opt.value); setPage(1); }}
              className={["px-3 h-full text-xs font-medium transition-colors border-r border-border last:border-r-0",
                typeFilter === opt.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >{opt.label}</button>
          ))}
        </div>

        <div className="flex items-center rounded-md border border-border overflow-hidden h-8">
          {[{ value: "all", label: "全部状态" }, { value: "pending", label: "处理中" }, { value: "completed", label: "已完成" }].map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1); }}
              className={["px-3 h-full text-xs font-medium transition-colors border-r border-border last:border-r-0",
                statusFilter === opt.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >{opt.label}</button>
          ))}
        </div>

        <Select value={pitcherFilter} onValueChange={(v) => { setPitcherFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="全部投手" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部投手</SelectItem>
            {pitchers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={providerFilter} onValueChange={(v) => { setProviderFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="全部开户商" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部开户商</SelectItem>
            {providers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">提交时间</span>
          <input type="date" value={dateRange.from} onChange={(e) => { setDateRange((r) => ({ ...r, from: e.target.value })); setPage(1); }} className="h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring" />
          <span className="text-xs text-muted-foreground">—</span>
          <input type="date" value={dateRange.to} onChange={(e) => { setDateRange((r) => ({ ...r, to: e.target.value })); setPage(1); }} className="h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring" />
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">清除</button>
          )}
        </div>
      </div>

      {/* Pending */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">处理中（{pending.length}）</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>类型</TableHead>
                <TableHead>投手</TableHead>
                <TableHead>开户商</TableHead>
                <TableHead>详情</TableHead>
                <TableHead>备注</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-24">提交时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => (
                  <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
                ))}</TableRow>
              ))}
              {!isLoading && pagedPending.length === 0 && (
                <TableRow><TableCell colSpan={7}>
                  <EmptyState icon={TicketIcon} title="暂无处理中的工单" />
                </TableCell></TableRow>
              )}
              {!isLoading && pagedPending.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><TicketTypeBadge type={t.type} /></TableCell>
                  <TableCell className="text-sm">{t.pitcherName ?? `#${t.pitcherId}`}</TableCell>
                  <TableCell className="text-sm">{t.providerName ?? `#${t.providerId}`}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[180px]">
                    {t.type === "new_account"
                      ? <span>{t.platform} · ${t.amount}</span>
                      : <>
                          <span className="block">BM: {t.targetBm}</span>
                          <span className="block text-muted-foreground/70 truncate">{t.account}</span>
                        </>
                    }
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{t.remark ?? "—"}</TableCell>
                  <TableCell><TicketStatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={PAGE_SIZE} total={pending.length} onPageChange={setPage} />
        </div>
      </div>

      {/* History */}
      <HistorySection tickets={completed} />
    </div>
  );
}
