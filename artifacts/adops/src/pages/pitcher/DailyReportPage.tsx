import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAccounts,
  useCreateDailyStat,
  useUpdateDailyStat,
  useListDailyStats,
  useListTeams,
  getListAccountsQueryKey,
  getListDailyStatsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, Plus, X, CheckCircle, Pencil, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";

interface Account {
  id: number;
  accountName: string;
  platform: string;
  currentBalance: string;
  theoreticalBalance?: string | null;
}

interface Team {
  id: number;
  name: string;
  businessType: string;
}

interface DailyStat {
  id: number;
  accountId: number;
  accountName?: string | null;
  date: string;
  spendAmount: string | number;
  realBalance: string | number;
  hasAlert: boolean;
  businessType?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  fanCount?: number | null;
  fanCost?: string | null;
  gmv?: string | null;
  orderCount?: number | null;
  roas?: string | null;
  avgOrderValue?: string | null;
}

interface ReportRow {
  key: string;
  accountId: string;
  spendAmount: string;
  businessType: string;
  teamId: string;
  fanCount: string;
  gmv: string;
  orderCount: string;
  expanded: boolean;
}

const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
const today = new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 20;

function newRow(): ReportRow {
  return { key: Math.random().toString(36).slice(2), accountId: "", spendAmount: "", businessType: "", teamId: "", fanCount: "", gmv: "", orderCount: "", expanded: false };
}

function BizPill({ biz, team, fanCost, roas, avgOrder }: { biz?: string | null; team?: string | null; fanCost?: string | null; roas?: string | null; avgOrder?: string | null }) {
  if (!biz) return <span className="text-muted-foreground text-xs">—</span>;
  if (biz === "liveChat") {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 rounded">聊单{team ? ` · ${team}` : ""}</span>
        {fanCost && <span className="text-xs text-muted-foreground">粉成本 <span className="font-mono">${fanCost}</span></span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded">独立站</span>
      {roas && <span className="text-xs text-muted-foreground">ROAS <span className="font-mono">{roas}</span>{avgOrder ? ` · 客单 $${avgOrder}` : ""}</span>}
    </div>
  );
}

function QuickDate({ label, value, active, onClick }: { label: string; value: string; active: boolean; onClick: (v: string) => void }) {
  return (
    <button
      onClick={() => onClick(value)}
      className={["text-xs px-2.5 py-1 rounded-md border transition-colors", active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"].join(" ")}
    >{label}</button>
  );
}

function EditDialog({ stat, accounts, teams, onClose }: { stat: DailyStat; accounts: Account[]; teams: Team[]; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [spendAmount, setSpendAmount] = useState(String(Number(stat.spendAmount).toFixed(2)));
  const [businessType, setBiz] = useState(stat.businessType ?? "");
  const [teamId, setTeamId] = useState(stat.teamId ? String(stat.teamId) : "");
  const [fanCount, setFanCount] = useState(stat.fanCount ? String(stat.fanCount) : "");
  const [gmv, setGmv] = useState(stat.gmv ? String(Number(stat.gmv).toFixed(2)) : "");
  const [orderCount, setOrderCount] = useState(stat.orderCount ? String(stat.orderCount) : "");

  const liveTeams = teams.filter((t) => t.businessType === "liveChat");
  const spend = parseFloat(spendAmount) || 0;
  const fanNum = parseInt(fanCount) || 0;
  const gmvNum = parseFloat(gmv) || 0;
  const orderNum = parseInt(orderCount) || 0;
  const fanCost = businessType === "liveChat" && fanNum > 0 && spend > 0 ? (spend / fanNum).toFixed(4) : null;
  const roas = businessType === "ecommerce" && gmvNum > 0 && spend > 0 ? (gmvNum / spend).toFixed(2) : null;
  const avgOrder = businessType === "ecommerce" && gmvNum > 0 && orderNum > 0 ? (gmvNum / orderNum).toFixed(2) : null;

  const update = useUpdateDailyStat({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) }); toast({ title: "修改成功" }); onClose(); },
      onError: (err: unknown) => { toast({ title: (err as { data?: { error?: string } })?.data?.error ?? "修改失败", variant: "destructive" }); },
    },
  });

  const handleSave = () => {
    const sp = parseFloat(spendAmount);
    if (isNaN(sp) || sp < 0) { toast({ title: "请输入有效消耗金额", variant: "destructive" }); return; }
    update.mutate({ id: stat.id, data: {
      spendAmount: sp.toFixed(2),
      businessType: (businessType as "liveChat" | "ecommerce") || null,
      teamId: (businessType === "liveChat" && teamId) ? Number(teamId) : null,
      fanCount: businessType === "liveChat" && fanCount ? parseInt(fanCount) : null,
      gmv: businessType === "ecommerce" && gmv ? parseFloat(gmv).toFixed(2) : null,
      orderCount: businessType === "ecommerce" && orderCount ? parseInt(orderCount) : null,
    }});
  };

  const acc = accounts.find((a) => a.id === stat.accountId);

  const toggleBiz = (v: string) => {
    const next = businessType === v ? "" : v;
    setBiz(next);
    setTeamId(""); setFanCount(""); setGmv(""); setOrderCount("");
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-base"><Pencil className="h-4 w-4 text-primary" />编辑上报数据</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground mb-0.5">{stat.date}</p>
            <p className="font-medium truncate">{acc?.accountName ?? stat.accountName ?? `#${stat.accountId}`}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">消耗金额（美元）<span className="text-destructive">*</span></Label>
            <Input type="number" min="0" step="0.01" value={spendAmount} onChange={(e) => setSpendAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">投放业务</Label>
            <div className="flex gap-2">
              <button onClick={() => toggleBiz("liveChat")}
                className={["flex-1 text-xs py-1.5 rounded-md border transition-colors", businessType === "liveChat" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"].join(" ")}>
                聊单
              </button>
              <button onClick={() => toggleBiz("ecommerce")}
                className={["flex-1 text-xs py-1.5 rounded-md border transition-colors", businessType === "ecommerce" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"].join(" ")}>
                独立站
              </button>
            </div>
          </div>
          {businessType === "liveChat" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-sm">服务团队</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="选择团队..." /></SelectTrigger>
                  <SelectContent>{liveTeams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">进粉数量</Label>
                <Input type="number" min="0" placeholder="0" value={fanCount} onChange={(e) => setFanCount(e.target.value)} />
                {fanCost && <p className="text-xs text-muted-foreground">粉成本 <span className="font-mono text-primary">${fanCost}</span></p>}
              </div>
            </div>
          )}
          {businessType === "ecommerce" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-sm">GMV（美元）</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={gmv} onChange={(e) => setGmv(e.target.value)} />
                {roas && <p className="text-xs text-muted-foreground">ROAS <span className="font-mono text-primary">{roas}</span></p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">订单数</Label>
                <Input type="number" min="0" placeholder="0" value={orderCount} onChange={(e) => setOrderCount(e.target.value)} />
                {avgOrder && <p className="text-xs text-muted-foreground">客单价 <span className="font-mono text-primary">${avgOrder}</span></p>}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={update.isPending}>{update.isPending ? "保存中..." : "保存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DailyReportPage() {
  const [sharedDate, setSharedDate] = useState(yesterday);
  const [rows, setRows] = useState<ReportRow[]>([newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [histFilter, setHistFilter] = useState("all");
  const [quickDate, setQuickDate] = useState("yesterday");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [histPage, setHistPage] = useState(1);
  const [editTarget, setEditTarget] = useState<DailyStat | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: accountsData } = useListAccounts({});
  const { data: teamsData } = useListTeams({});
  const accounts = useMemo(() => Array.isArray(accountsData) ? (accountsData as Account[]) : [], [accountsData]);
  const teams = useMemo(() => Array.isArray(teamsData) ? (teamsData as Team[]) : [], [teamsData]);
  const liveTeams = teams.filter((t) => t.businessType === "liveChat");

  const getDateRange = () => {
    if (quickDate === "yesterday") return { from: yesterday, to: yesterday };
    if (quickDate === "week") {
      const d = new Date(); d.setDate(d.getDate() - 6);
      return { from: d.toISOString().slice(0, 10), to: yesterday };
    }
    if (quickDate === "month") {
      const d = new Date(); d.setDate(1);
      return { from: d.toISOString().slice(0, 10), to: yesterday };
    }
    if (quickDate === "lastmonth") {
      const d = new Date(); d.setDate(1);
      const end = new Date(d); end.setDate(0);
      d.setMonth(d.getMonth() - 1);
      return { from: d.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    }
    return { from: customFrom, to: customTo };
  };

  const { from: dateFrom, to: dateTo } = getDateRange();
  const apiParams: Record<string, string> = {};
  if (dateFrom) apiParams.dateFrom = dateFrom;
  if (dateTo) apiParams.dateTo = dateTo;
  if (histFilter !== "all") apiParams.accountId = histFilter;

  const { data: statsData, isLoading: statsLoading } = useListDailyStats(apiParams);
  const allStats = useMemo(() => {
    const raw = Array.isArray(statsData) ? (statsData as DailyStat[]) : [];
    return [...raw].sort((a, b) => b.date.localeCompare(a.date));
  }, [statsData]);
  const pagedStats = usePagination(allStats, PAGE_SIZE, histPage);
  const totalSpend = allStats.reduce((s, r) => s + Number(r.spendAmount), 0);

  const { data: yStatsData } = useListDailyStats({ dateFrom: sharedDate, dateTo: sharedDate } as Record<string, string>);
  const reportedIds = useMemo(() => new Set((Array.isArray(yStatsData) ? yStatsData : []).map((s: { accountId: number }) => s.accountId)), [yStatsData]);

  const createMutation = useCreateDailyStat({});

  const updateRow = (key: string, field: keyof ReportRow, value: string | boolean) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const next = { ...r, [field]: value };
      if (field === "businessType") { next.teamId = ""; next.fanCount = ""; next.gmv = ""; next.orderCount = ""; }
      return next;
    }));
  };
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));
  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const handleSubmitAll = async () => {
    for (const r of rows) {
      if (!r.accountId || !r.spendAmount) {
        toast({ title: "请填写完整", description: "每行都需要选择账户并填写消耗金额。", variant: "destructive" });
        return;
      }
      if (isNaN(parseFloat(r.spendAmount)) || parseFloat(r.spendAmount) < 0) {
        toast({ title: "金额无效", variant: "destructive" });
        return;
      }
    }
    setSubmitting(true);
    let failed = 0;
    for (const r of rows) {
      try {
        await new Promise<void>((resolve, reject) => {
          createMutation.mutate({ data: {
            accountId: Number(r.accountId),
            date: sharedDate,
            spendAmount: parseFloat(r.spendAmount).toFixed(2),
            businessType: (r.businessType as "liveChat" | "ecommerce") || null,
            teamId: (r.businessType === "liveChat" && r.teamId) ? Number(r.teamId) : null,
            fanCount: (r.businessType === "liveChat" && r.fanCount) ? parseInt(r.fanCount) : null,
            gmv: (r.businessType === "ecommerce" && r.gmv) ? parseFloat(r.gmv).toFixed(2) : null,
            orderCount: (r.businessType === "ecommerce" && r.orderCount) ? parseInt(r.orderCount) : null,
          }}, { onSuccess: () => resolve(), onError: (e) => reject(e) });
        });
      } catch (e: unknown) {
        const msg = (e as { data?: { error?: string } })?.data?.error ?? "";
        if (msg.includes("已上报")) {
          toast({ title: "重复上报", description: msg, variant: "destructive" });
        } else {
          failed++;
        }
      }
    }
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
    queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) });
    setSubmitting(false);
    if (failed === 0) {
      setSubmitted(true);
      setRows([newRow()]);
      toast({ title: "提交成功", description: `${rows.length} 条上报数据已保存。` });
      setTimeout(() => setSubmitted(false), 3000);
    } else {
      toast({ title: `${failed} 条提交失败`, variant: "destructive" });
    }
  };

  const handleQuickDate = (v: string) => { setQuickDate(v); setHistPage(1); if (v !== "custom") { setCustomFrom(""); setCustomTo(""); } };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">每日上报</h1>
        <p className="text-sm text-muted-foreground mt-0.5">填写昨日各账户消耗，余额由系统自动计算</p>
      </div>

      {/* ── 填报区 ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* 共享日期 */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-muted/30">
          <span className="text-xs font-medium text-foreground shrink-0">上报日期</span>
          <Input
            type="date"
            className="h-7 w-36 text-xs"
            value={sharedDate}
            max={today}
            onChange={(e) => setSharedDate(e.target.value)}
          />
          <span className="text-xs text-muted-foreground hidden sm:block">各行共用，可单独改</span>
          <Button variant="ghost" size="sm" className="ml-auto gap-1.5 h-7 text-xs" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> 添加一行
          </Button>
        </div>

        {/* 行列表 */}
        <div className="divide-y divide-border/60">
          {rows.map((row, idx) => {
            const selAcc = accounts.find((a) => String(a.id) === row.accountId);
            const bal = parseFloat(selAcc?.theoreticalBalance ?? selAcc?.currentBalance ?? "0");
            const spend = parseFloat(row.spendAmount) || 0;
            const previewBal = selAcc && row.spendAmount ? (bal - spend).toFixed(2) : null;
            const fanNum = parseInt(row.fanCount) || 0;
            const gmvNum = parseFloat(row.gmv) || 0;
            const orderNum = parseInt(row.orderCount) || 0;
            const fanCost = row.businessType === "liveChat" && fanNum > 0 && spend > 0 ? (spend / fanNum).toFixed(4) : null;
            const roas = row.businessType === "ecommerce" && gmvNum > 0 && spend > 0 ? (gmvNum / spend).toFixed(2) : null;
            const avgOrder = row.businessType === "ecommerce" && gmvNum > 0 && orderNum > 0 ? (gmvNum / orderNum).toFixed(2) : null;
            const alreadyReported = row.accountId && reportedIds.has(Number(row.accountId));
            const hasOps = row.businessType === "liveChat" || row.businessType === "ecommerce";

            return (
              <div key={row.key} className={["px-3 py-2 space-y-1.5 transition-colors", alreadyReported ? "bg-amber-50/50 dark:bg-amber-900/10" : ""].join(" ")}>
                {/* 主行 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">{idx + 1}</span>

                  {/* 账户 */}
                  <Select value={row.accountId} onValueChange={(v) => updateRow(row.key, "accountId", v)}>
                    <SelectTrigger className="h-8 text-xs flex-[2] min-w-0">
                      <SelectValue placeholder="选择账户..." />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.accountName}
                          {reportedIds.has(a.id) ? " ✓已报" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* 消耗 */}
                  <div className="relative flex-1 min-w-[100px]">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      className="h-8 text-sm pl-6"
                      value={row.spendAmount}
                      onChange={(e) => updateRow(row.key, "spendAmount", e.target.value)}
                    />
                  </div>

                  {/* 业务类型迷你按钮 */}
                  <div className="flex gap-1 shrink-0">
                    {[["liveChat", "聊单"], ["ecommerce", "独立站"]].map(([v, label]) => (
                      <button key={v} onClick={() => updateRow(row.key, "businessType", row.businessType === v ? "" : v)}
                        className={["text-xs px-2 py-1 rounded border transition-colors", row.businessType === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"].join(" ")}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* 展开/收起运营字段 */}
                  {hasOps && (
                    <button onClick={() => updateRow(row.key, "expanded", !row.expanded)}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                      {row.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  )}

                  {/* 删除 */}
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(row.key)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* 提示行 */}
                {(alreadyReported || previewBal !== null) && (
                  <div className="flex items-center gap-3 pl-6 text-xs">
                    {alreadyReported && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <AlertCircle className="h-3 w-3" /> {sharedDate} 已有上报
                      </span>
                    )}
                    {previewBal !== null && !alreadyReported && (
                      <span className="text-muted-foreground">提交后余额：<span className="font-mono text-primary">${previewBal}</span></span>
                    )}
                  </div>
                )}

                {/* 运营字段（展开） */}
                {hasOps && row.expanded && (
                  <div className="pl-6 grid grid-cols-2 gap-2.5 pt-0.5">
                    {row.businessType === "liveChat" && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">服务团队</Label>
                          <Select value={row.teamId} onValueChange={(v) => updateRow(row.key, "teamId", v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="选择团队..." /></SelectTrigger>
                            <SelectContent>{liveTeams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">进粉数量</Label>
                          <Input type="number" min="0" placeholder="0" className="h-7 text-xs"
                            value={row.fanCount} onChange={(e) => updateRow(row.key, "fanCount", e.target.value)} />
                          {fanCost && <p className="text-xs text-muted-foreground">粉成本 <span className="font-mono text-green-600">${fanCost}</span></p>}
                        </div>
                      </>
                    )}
                    {row.businessType === "ecommerce" && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">GMV（美元）</Label>
                          <Input type="number" min="0" step="0.01" placeholder="0.00" className="h-7 text-xs"
                            value={row.gmv} onChange={(e) => updateRow(row.key, "gmv", e.target.value)} />
                          {roas && <p className="text-xs text-muted-foreground">ROAS <span className="font-mono text-green-600">{roas}</span></p>}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">订单数</Label>
                          <Input type="number" min="0" placeholder="0" className="h-7 text-xs"
                            value={row.orderCount} onChange={(e) => updateRow(row.key, "orderCount", e.target.value)} />
                          {avgOrder && <p className="text-xs text-muted-foreground">客单价 <span className="font-mono text-green-600">${avgOrder}</span></p>}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 提交 */}
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {rows.length > 1 ? `共 ${rows.length} 行` : ""}
          </span>
          <Button size="sm" className="gap-1.5 px-5" onClick={handleSubmitAll} disabled={submitting}>
            {submitted ? (
              <><CheckCircle className="h-3.5 w-3.5" /> 已全部提交</>
            ) : submitting ? "提交中..." : (
              <><CheckCircle className="h-3.5 w-3.5" /> 提交{rows.length > 1 ? ` ${rows.length} 条` : ""}上报</>
            )}
          </Button>
        </div>
      </div>

      {/* ── 上报记录 ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">上报记录</h2>

        {/* 筛选工具栏 */}
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={histFilter} onValueChange={(v) => { setHistFilter(v); setHistPage(1); }}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部账户</SelectItem>
              {accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.accountName}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="h-4 w-px bg-border mx-0.5" />

          <QuickDate label="昨天" value="yesterday" active={quickDate === "yesterday"} onClick={handleQuickDate} />
          <QuickDate label="近7天" value="week" active={quickDate === "week"} onClick={handleQuickDate} />
          <QuickDate label="本月" value="month" active={quickDate === "month"} onClick={handleQuickDate} />
          <QuickDate label="上月" value="lastmonth" active={quickDate === "lastmonth"} onClick={handleQuickDate} />
          <QuickDate label="自定义" value="custom" active={quickDate === "custom"} onClick={handleQuickDate} />

          {quickDate === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input type="date" className="h-8 w-34 text-xs" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setHistPage(1); }} />
              <span className="text-xs text-muted-foreground">至</span>
              <Input type="date" className="h-8 w-34 text-xs" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setHistPage(1); }} />
            </div>
          )}

          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span>{allStats.length} 条</span>
            <span className="font-mono font-semibold text-primary">${totalSpend.toFixed(2)}</span>
          </div>
        </div>

        {/* 表格 */}
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-24">日期</TableHead>
                <TableHead>账户</TableHead>
                <TableHead className="text-right">消耗</TableHead>
                <TableHead className="text-right">余额</TableHead>
                <TableHead>业务 / 运营</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statsLoading && Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => (
                  <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-16" /></TableCell>
                ))}</TableRow>
              ))}
              {!statsLoading && pagedStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState icon={BarChart3} title="暂无上报记录" description="该时间段内还没有任何上报数据。" />
                  </TableCell>
                </TableRow>
              )}
              {!statsLoading && pagedStats.map((s) => (
                <TableRow key={s.id} className={s.hasAlert ? "bg-red-50/40 dark:bg-red-900/10" : ""}>
                  <TableCell className="font-mono text-sm text-muted-foreground">{s.date}</TableCell>
                  <TableCell className="max-w-[180px]">
                    <TruncatedCell value={s.accountName ?? `#${s.accountId}`} />
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-orange-500">
                    ${Number(s.spendAmount).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-primary">
                    ${Number(s.realBalance).toFixed(2)}
                    {s.hasAlert && <span className="ml-1 text-red-500 text-xs">!</span>}
                  </TableCell>
                  <TableCell>
                    <BizPill
                      biz={s.businessType}
                      team={s.teamName}
                      fanCost={s.fanCost}
                      roas={s.roas}
                      avgOrder={s.avgOrderValue}
                    />
                  </TableCell>
                  <TableCell>
                    <button onClick={() => setEditTarget(s)} className="text-muted-foreground hover:text-primary transition-colors p-1">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={histPage} pageSize={PAGE_SIZE} total={allStats.length} onPageChange={setHistPage} />
        </div>
      </div>

      {editTarget && (
        <EditDialog stat={editTarget} accounts={accounts} teams={teams} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}
