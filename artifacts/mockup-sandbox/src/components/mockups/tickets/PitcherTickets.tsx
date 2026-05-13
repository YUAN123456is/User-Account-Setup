import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Clock, Ticket, ChevronDown, ChevronUp, RefreshCw, Search, CalendarDays, X } from "lucide-react";

const PROVIDERS = ["开户商 - 小王", "开户商 - 晓敏", "开户商 - 张总"];
const PLATFORMS = ["FB", "GG", "TT", "TW"];

const ALL_TICKETS = [
  { id: 1, type: "new_account", typeLabel: "开新户", provider: "开户商 - 小王", status: "completed", date: "2026-05-10", platform: "FB", amount: "$500", remark: "尽快处理", completedNote: "已完成，账户 ID：act_12345678" },
  { id: 2, type: "rebind_bm",  typeLabel: "换绑 BM", provider: "开户商 - 晓敏", status: "pending",   date: "2026-05-12", targetBm: "BM_002", account: "act_98765432", remark: "" },
  { id: 3, type: "new_account", typeLabel: "开新户", provider: "开户商 - 张总", status: "pending",   date: "2026-05-13", platform: "GG",  amount: "$1000", remark: "希望用张总主体", completedNote: null },
  { id: 4, type: "rebind_bm",  typeLabel: "换绑 BM", provider: "开户商 - 小王", status: "completed", date: "2026-05-08", targetBm: "BM_003", account: "act_11223344", remark: "", completedNote: "已处理" },
  { id: 5, type: "new_account", typeLabel: "开新户", provider: "开户商 - 晓敏", status: "completed", date: "2026-05-06", platform: "TT",  amount: "$800", remark: "", completedNote: "账户 act_55667788" },
];

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 flex flex-col gap-0.5 ${color}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return status === "completed"
    ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />已完成</Badge>
    : <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1 text-xs"><Clock className="h-3 w-3" />待处理</Badge>;
}

export function PitcherTickets() {
  const [provider, setProvider] = useState("");
  const [ticketType, setTicketType] = useState("");
  const [platform, setPlatform] = useState("");
  const [amount, setAmount] = useState("");
  const [newRemark, setNewRemark] = useState("");
  const [targetBm, setTargetBm] = useState("");
  const [account, setAccount] = useState("");
  const [rebindRemark, setRebindRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // history panel
  const [historyOpen, setHistoryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const total = ALL_TICKETS.length;
  const pending = ALL_TICKETS.filter(t => t.status === "pending").length;
  const completed = ALL_TICKETS.filter(t => t.status === "completed").length;

  const filtered = useMemo(() => ALL_TICKETS.filter(t => {
    if (search && !t.typeLabel.includes(search) && !t.provider.includes(search)) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  }), [search, dateFrom, dateTo]);

  const handleSubmit = () => {
    setSubmitting(true);
    setTimeout(() => { setSubmitting(false); setSubmitted(true); setTimeout(() => setSubmitted(false), 1500); }, 800);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex h-screen">
      {/* Sidebar */}
      <div className="w-52 border-r border-border bg-card flex flex-col py-4 px-3 gap-1 shrink-0">
        <div className="text-xs font-semibold text-muted-foreground px-2 mb-2">投手工作台</div>
        {["工作台", "我的账户", "每日上报", "申请充值", "团队反馈", "FB 账号配置"].map(item => (
          <div key={item} className="text-sm px-2 py-1.5 rounded-md text-muted-foreground hover:bg-muted cursor-pointer">{item}</div>
        ))}
        <div className="text-sm px-2 py-1.5 rounded-md bg-primary/10 text-primary font-medium flex items-center gap-2 cursor-pointer">
          <Ticket className="h-3.5 w-3.5" />提交工单
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Ticket className="h-5 w-5 text-primary" />工单管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">向开户商提交开新户或换绑 BM 请求</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="全部工单" value={total} color="border-border bg-card" />
          <StatCard label="待处理" value={pending} color="border-amber-500/20 bg-amber-500/5" />
          <StatCard label="已完成" value={completed} color="border-emerald-500/20 bg-emerald-500/5" />
        </div>

        {/* Submit form */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-5">
          <p className="font-semibold text-sm">提交新工单</p>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">① 选择目标开户商</p>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="max-w-xs h-9"><SelectValue placeholder="选择开户商..." /></SelectTrigger>
              <SelectContent>{PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">② 选择工单类型</p>
            <div className="flex gap-3">
              {[{ value: "new_account", label: "开新户" }, { value: "rebind_bm", label: "换绑 BM" }].map(t => (
                <button key={t.value} onClick={() => setTicketType(t.value)}
                  className={["w-32 rounded-lg border-2 py-2 text-sm font-medium transition-all", ticketType === t.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/40"].join(" ")}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {ticketType === "new_account" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">③ 填写资料</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">广告平台 <span className="text-red-400">*</span></Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="选择平台..." /></SelectTrigger>
                    <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">初始金额（美元）<span className="text-red-400">*</span></Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input className="pl-6 h-9" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
                  </div>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-sm">备注</Label>
                  <Textarea rows={2} placeholder="其他要求，自由填写..." value={newRemark} onChange={e => setNewRemark(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {ticketType === "rebind_bm" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">③ 填写资料</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">目标 BM <span className="text-red-400">*</span></Label>
                  <Input className="h-9" placeholder="目标 BM ID 或名称，自由填写" value={targetBm} onChange={e => setTargetBm(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">账户 <span className="text-red-400">*</span></Label>
                  <Textarea rows={2} placeholder="涉及的广告账户，自由填写（可填多个）" value={account} onChange={e => setAccount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">备注</Label>
                  <Textarea rows={2} placeholder="其他说明..." value={rebindRemark} onChange={e => setRebindRemark(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1 border-t border-border">
            <Button onClick={handleSubmit} disabled={!provider || !ticketType || submitting} className="gap-1.5">
              {submitting ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />提交中...</> : <><Ticket className="h-3.5 w-3.5" />提交工单</>}
            </Button>
            {submitted && <span className="text-sm text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />已发送给开户商</span>}
          </div>
        </div>

        {/* History collapsible */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
          >
            <span className="font-semibold text-sm flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              历史工单记录
              <Badge variant="secondary" className="text-xs">{ALL_TICKETS.length}</Badge>
            </span>
            {historyOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {historyOpen && (
            <div className="border-t border-border">
              {/* Filters */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/20 flex-wrap">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input className="pl-8 h-8 text-sm" placeholder="搜索类型、开户商..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <Input type="date" className="h-8 text-xs w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  <span>—</span>
                  <Input type="date" className="h-8 text-xs w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
                {(search || dateFrom || dateTo) && (
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}>
                    <X className="h-3 w-3" />清除
                  </Button>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>工单类型</TableHead>
                    <TableHead>开户商</TableHead>
                    <TableHead>日期</TableHead>
                    <TableHead>详情</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">暂无符合条件的记录</TableCell></TableRow>
                  )}
                  {filtered.map(t => (
                    <TableRow key={t.id} className="text-sm">
                      <TableCell className="font-medium">{t.typeLabel}</TableCell>
                      <TableCell className="text-muted-foreground">{t.provider}</TableCell>
                      <TableCell className="text-muted-foreground">{t.date}</TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[180px] truncate">
                        {t.type === "new_account" ? `${t.platform} · $${t.amount?.replace("$","")}` : `BM: ${(t as { targetBm?: string }).targetBm}`}
                      </TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
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
