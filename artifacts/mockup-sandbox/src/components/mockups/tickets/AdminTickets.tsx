import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Clock, Ticket, ChevronDown, ChevronUp, Search, CalendarDays, X, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

const ALL_TICKETS = [
  { id: 1, type: "new_account", typeLabel: "开新户", pitcher: "婧",  provider: "开户商 - 小王", status: "pending",   date: "2026-05-13", platform: "FB", amount: "$500",  targetBm: null, account: null, remark: "尽快处理",      completedNote: null, completedAt: null },
  { id: 2, type: "rebind_bm",   typeLabel: "换绑 BM", pitcher: "婧",  provider: "开户商 - 晓敏", status: "pending",   date: "2026-05-12", platform: null, amount: null,   targetBm: "BM_002", account: "act_98765432", remark: "", completedNote: null, completedAt: null },
  { id: 3, type: "new_account", typeLabel: "开新户", pitcher: "Leo",  provider: "开户商 - 张总", status: "completed", date: "2026-05-10", platform: "GG", amount: "$1000", targetBm: null, account: null, remark: "",              completedNote: "账户 act_11112222", completedAt: "2026-05-11" },
  { id: 4, type: "rebind_bm",   typeLabel: "换绑 BM", pitcher: "Leo",  provider: "开户商 - 小王", status: "completed", date: "2026-05-09", platform: null, amount: null,   targetBm: "BM_004", account: "act_55554321", remark: "紧急", completedNote: "已处理", completedAt: "2026-05-09" },
  { id: 5, type: "new_account", typeLabel: "开新户", pitcher: "婧",  provider: "开户商 - 晓敏", status: "completed", date: "2026-05-06", platform: "TT", amount: "$800",  targetBm: null, account: null, remark: "",              completedNote: "账户 act_55667788", completedAt: "2026-05-07" },
  { id: 6, type: "new_account", typeLabel: "开新户", pitcher: "Simon", provider: "开户商 - 张总", status: "pending",   date: "2026-05-05", platform: "TW", amount: "$300",  targetBm: null, account: null, remark: "",              completedNote: null, completedAt: null },
  { id: 7, type: "rebind_bm",   typeLabel: "换绑 BM", pitcher: "Simon", provider: "开户商 - 晓敏", status: "completed", date: "2026-05-03", platform: null, amount: null,   targetBm: "BM_005", account: "act_99887766", remark: "", completedNote: "完成", completedAt: "2026-05-04" },
];

const PITCHERS = ["全部投手", ...Array.from(new Set(ALL_TICKETS.map(t => t.pitcher)))];
const PROVIDERS = ["全部开户商", ...Array.from(new Set(ALL_TICKETS.map(t => t.provider)))];

function StatusBadge({ status }: { status: string }) {
  return status === "completed"
    ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />已完成</Badge>
    : <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1 text-xs"><Clock className="h-3 w-3" />待处理</Badge>;
}
function TypeBadge({ type, label }: { type: string; label: string }) {
  return <span className={["inline-flex text-xs font-medium px-2 py-0.5 rounded-full border", type === "new_account" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-violet-500/10 text-violet-400 border-violet-500/20"].join(" ")}>{label}</span>;
}

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 flex flex-col gap-0.5 ${color}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

export function AdminTickets() {
  const [historyOpen, setHistoryOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pitcherFilter, setPitcherFilter] = useState("全部投手");
  const [providerFilter, setProviderFilter] = useState("全部开户商");
  const [typeFilter, setTypeFilter] = useState("全部类型");

  const total = ALL_TICKETS.length;
  const pending = ALL_TICKETS.filter(t => t.status === "pending").length;
  const completed = ALL_TICKETS.filter(t => t.status === "completed").length;
  const newAcct = ALL_TICKETS.filter(t => t.type === "new_account").length;
  const rebind = ALL_TICKETS.filter(t => t.type === "rebind_bm").length;

  const filtered = useMemo(() => ALL_TICKETS.filter(t => {
    if (search && !t.typeLabel.includes(search) && !t.pitcher.includes(search) && !t.provider.includes(search)) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    if (pitcherFilter !== "全部投手" && t.pitcher !== pitcherFilter) return false;
    if (providerFilter !== "全部开户商" && t.provider !== providerFilter) return false;
    if (typeFilter !== "全部类型" && t.type !== typeFilter) return false;
    return true;
  }), [search, dateFrom, dateTo, pitcherFilter, providerFilter, typeFilter]);

  const hasFilters = search || dateFrom || dateTo || pitcherFilter !== "全部投手" || providerFilter !== "全部开户商" || typeFilter !== "全部类型";

  const clearFilters = () => { setSearch(""); setDateFrom(""); setDateTo(""); setPitcherFilter("全部投手"); setProviderFilter("全部开户商"); setTypeFilter("全部类型"); };

  return (
    <div className="min-h-screen bg-background text-foreground flex h-screen">
      {/* Sidebar */}
      <div className="w-52 border-r border-border bg-card flex flex-col py-4 px-3 gap-1 shrink-0">
        <div className="text-xs font-semibold text-muted-foreground px-2 mb-2">超级管理员</div>
        {["用户管理", "账户管理", "充值管理", "每日数据"].map(item => (
          <div key={item} className="text-sm px-2 py-1.5 rounded-md text-muted-foreground hover:bg-muted cursor-pointer">{item}</div>
        ))}
        <div className="text-sm px-2 py-1.5 rounded-md bg-primary/10 text-primary font-medium flex items-center gap-2 cursor-pointer">
          <Ticket className="h-3.5 w-3.5" />工单总览
          {pending > 0 && <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{pending}</span>}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><LayoutDashboard className="h-5 w-5 text-primary" />工单总览</h1>
          <p className="text-sm text-muted-foreground mt-0.5">查看所有投手提交给开户商的工单记录</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="全部工单" value={total} color="border-border bg-card" />
          <StatCard label="待处理" value={pending} color="border-amber-500/20 bg-amber-500/5" />
          <StatCard label="已完成" value={completed} color="border-emerald-500/20 bg-emerald-500/5" />
          <StatCard label="开新户" value={newAcct} color="border-blue-500/20 bg-blue-500/5" />
          <StatCard label="换绑 BM" value={rebind} color="border-violet-500/20 bg-violet-500/5" />
        </div>

        {/* History table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <button onClick={() => setHistoryOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors">
            <span className="font-semibold text-sm flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              全部工单记录
              <Badge variant="secondary" className="text-xs">{filtered.length} / {total}</Badge>
            </span>
            {historyOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {historyOpen && (
            <div className="border-t border-border">
              {/* Filters */}
              <div className="px-4 py-3 border-b border-border bg-muted/20 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[160px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="pl-8 h-8 text-sm" placeholder="搜索投手、开户商、类型..." value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    <Input type="date" className="h-8 text-xs w-34" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                    <span className="text-muted-foreground text-sm">—</span>
                    <Input type="date" className="h-8 text-xs w-34" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                  {hasFilters && (
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" onClick={clearFilters}>
                      <X className="h-3 w-3" />清除筛选
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={pitcherFilter} onValueChange={setPitcherFilter}>
                    <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>{PITCHERS.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={providerFilter} onValueChange={setProviderFilter}>
                    <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{PROVIDERS.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="全部类型" className="text-xs">全部类型</SelectItem>
                      <SelectItem value="new_account" className="text-xs">开新户</SelectItem>
                      <SelectItem value="rebind_bm" className="text-xs">换绑 BM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>ID</TableHead>
                    <TableHead>投手</TableHead>
                    <TableHead>开户商</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>日期</TableHead>
                    <TableHead>详情</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>完成时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8 text-sm">暂无符合条件的记录</TableCell></TableRow>
                  )}
                  {filtered.map(t => (
                    <TableRow key={t.id} className="text-sm">
                      <TableCell className="text-muted-foreground font-mono text-xs">#{t.id}</TableCell>
                      <TableCell className="font-medium">{t.pitcher}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{t.provider}</TableCell>
                      <TableCell><TypeBadge type={t.type} label={t.typeLabel} /></TableCell>
                      <TableCell className="text-muted-foreground">{t.date}</TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate">
                        {t.type === "new_account" ? `${t.platform} · ${t.amount}` : `BM: ${t.targetBm}`}
                      </TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                      <TableCell className="text-muted-foreground text-xs">{t.completedAt ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
