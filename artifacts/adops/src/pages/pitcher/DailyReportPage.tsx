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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateRangePicker, type DateRange } from "@/components/shared/DateRangePicker";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { StatsBar } from "@/components/shared/StatsBar";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, Plus, X, CheckCircle, Info, Pencil, History } from "lucide-react";

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

interface ReportCard {
  key: string;
  accountId: string;
  date: string;
  spendAmount: string;
  businessType: string;
  teamId: string;
  fanCount: string;
  gmv: string;
  orderCount: string;
}

const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
const PAGE_SIZE = 20;

const BIZ_LABELS: Record<string, string> = { liveChat: "聊单", ecommerce: "独立站" };

function newCard(): ReportCard {
  return { key: Math.random().toString(36).slice(2), accountId: "", date: yesterday, spendAmount: "", businessType: "", teamId: "", fanCount: "", gmv: "", orderCount: "" };
}

function EditStatDialog({ stat, accounts, teams, onClose }: { stat: DailyStat; accounts: Account[]; teams: Team[]; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [spendAmount, setSpendAmount] = useState(String(Number(stat.spendAmount).toFixed(2)));
  const [businessType, setBusinessType] = useState(stat.businessType ?? "");
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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) });
        toast({ title: "修改成功" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "修改失败";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const handleSave = () => {
    const sp = parseFloat(spendAmount);
    if (isNaN(sp) || sp < 0) { toast({ title: "请输入有效消耗金额", variant: "destructive" }); return; }
    update.mutate({
      id: stat.id,
      data: {
        spendAmount: sp.toFixed(2),
        businessType: (businessType as "liveChat" | "ecommerce") || null,
        teamId: (businessType === "liveChat" && teamId) ? Number(teamId) : null,
        fanCount: businessType === "liveChat" && fanCount ? parseInt(fanCount) : null,
        gmv: businessType === "ecommerce" && gmv ? parseFloat(gmv).toFixed(2) : null,
        orderCount: businessType === "ecommerce" && orderCount ? parseInt(orderCount) : null,
      },
    });
  };

  const acc = accounts.find((a) => a.id === stat.accountId);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4 text-primary" />编辑上报数据</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground mb-0.5">账户 · {stat.date}</p>
            <p className="font-medium truncate">{acc?.accountName ?? stat.accountName ?? `#${stat.accountId}`}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">消耗金额（美元）<span className="text-destructive">*</span></Label>
            <Input type="number" min="0" step="0.01" value={spendAmount} onChange={(e) => setSpendAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">投放业务</Label>
            <div className="flex gap-2">
              {["", "liveChat", "ecommerce"].map((v) => (
                <button key={v} onClick={() => { setBusinessType(v); setTeamId(""); setFanCount(""); setGmv(""); setOrderCount(""); }}
                  className={["flex-1 text-xs py-1.5 rounded-md border transition-colors", businessType === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"].join(" ")}>
                  {v === "" ? "不填" : BIZ_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
          {businessType === "liveChat" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-sm">服务团队</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="请选择团队..." /></SelectTrigger>
                  <SelectContent>{liveTeams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">进粉数量</Label>
                <Input type="number" min="0" step="1" placeholder="0" value={fanCount} onChange={(e) => setFanCount(e.target.value)} />
                {fanCost && <p className="text-xs text-muted-foreground px-1">粉丝成本：<span className="font-mono text-primary">${fanCost}</span></p>}
              </div>
            </>
          )}
          {businessType === "ecommerce" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-sm">购买金额 GMV（美元）</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={gmv} onChange={(e) => setGmv(e.target.value)} />
                {roas && <p className="text-xs text-muted-foreground px-1">ROAS：<span className="font-mono text-primary">{roas}</span></p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">订单数</Label>
                <Input type="number" min="0" step="1" placeholder="0" value={orderCount} onChange={(e) => setOrderCount(e.target.value)} />
                {avgOrder && <p className="text-xs text-muted-foreground px-1">客单价：<span className="font-mono text-primary">${avgOrder}</span></p>}
              </div>
            </>
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
  const [cards, setCards] = useState<ReportCard[]>([newCard()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [accountFilter, setAccountFilter] = useState("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [editTarget, setEditTarget] = useState<DailyStat | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: accountsData } = useListAccounts({});
  const { data: teamsData } = useListTeams({});
  const accounts = useMemo(() => Array.isArray(accountsData) ? (accountsData as Account[]) : [], [accountsData]);
  const teams = useMemo(() => Array.isArray(teamsData) ? (teamsData as Team[]) : [], [teamsData]);

  const apiParams: Record<string, string> = {};
  if (dateRange.from) apiParams.dateFrom = dateRange.from;
  if (dateRange.to) apiParams.dateTo = dateRange.to;
  if (accountFilter !== "all") apiParams.accountId = accountFilter;

  const { data: statsData, isLoading: statsLoading } = useListDailyStats(apiParams);
  const allStats = useMemo(() => {
    const raw = Array.isArray(statsData) ? (statsData as DailyStat[]) : [];
    return [...raw].sort((a, b) => b.date.localeCompare(a.date));
  }, [statsData]);

  const pagedStats = usePagination(allStats, PAGE_SIZE, historyPage);

  const totalSpend = allStats.reduce((s, r) => s + Number(r.spendAmount), 0);

  const { data: todayStatsData } = useListDailyStats({ dateFrom: yesterday, dateTo: yesterday } as Record<string, string>);
  const todayStats = Array.isArray(todayStatsData) ? todayStatsData : [];
  const reportedIds = useMemo(() => new Set((todayStats as Array<{ accountId: number }>).map((s) => s.accountId)), [todayStats]);

  const createMutation = useCreateDailyStat({});

  const updateCard = (key: string, field: keyof ReportCard, value: string) => {
    setCards((prev) => prev.map((c) => {
      if (c.key !== key) return c;
      const next = { ...c, [field]: value };
      if (field === "businessType") {
        next.teamId = "";
        next.fanCount = "";
        next.gmv = "";
        next.orderCount = "";
      }
      return next;
    }));
  };

  const removeCard = (key: string) => setCards((prev) => prev.filter((c) => c.key !== key));
  const addCard = () => setCards((prev) => [...prev, newCard()]);

  const handleSubmitAll = async () => {
    for (const c of cards) {
      if (!c.accountId || !c.spendAmount || !c.date) {
        toast({ title: "请填写完整", description: "每张卡片都需要选择账户、日期并填写消耗金额。", variant: "destructive" });
        return;
      }
      const sp = parseFloat(c.spendAmount);
      if (isNaN(sp) || sp < 0) {
        toast({ title: "金额无效", description: "请输入有效的消耗金额（≥ 0）。", variant: "destructive" });
        return;
      }
    }
    setSubmitting(true);
    let failed = 0;
    for (const c of cards) {
      try {
        await new Promise<void>((resolve, reject) => {
          createMutation.mutate({
            data: {
              accountId: Number(c.accountId),
              date: c.date,
              spendAmount: parseFloat(c.spendAmount).toFixed(2),
              businessType: (c.businessType as "liveChat" | "ecommerce") || null,
              teamId: (c.businessType === "liveChat" && c.teamId) ? Number(c.teamId) : null,
              fanCount: (c.businessType === "liveChat" && c.fanCount) ? parseInt(c.fanCount) : null,
              gmv: (c.businessType === "ecommerce" && c.gmv) ? parseFloat(c.gmv).toFixed(2) : null,
              orderCount: (c.businessType === "ecommerce" && c.orderCount) ? parseInt(c.orderCount) : null,
            },
          }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
        });
      } catch (e: unknown) {
        const msg = (e as { data?: { error?: string } })?.data?.error ?? "";
        if (msg.includes("已上报")) {
          toast({ title: `账户今日已上报`, description: msg, variant: "destructive" });
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
      setCards([newCard()]);
      toast({ title: "全部提交成功", description: `${cards.length} 条上报数据已提交。` });
      setTimeout(() => setSubmitted(false), 3000);
    } else {
      toast({ title: `${failed} 条提交失败`, variant: "destructive" });
    }
  };

  const liveTeams = teams.filter((t) => t.businessType === "liveChat");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">每日上报</h1>
        <p className="text-sm text-muted-foreground mt-0.5">提交今日消耗数据，余额由系统自动计算</p>
      </div>

      {/* ── 填报区 ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">填报区</h2>
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={addCard}>
            <Plus className="h-3.5 w-3.5" /> 添加消耗记录
          </Button>
        </div>

        {cards.map((card, idx) => {
          const selAccount = accounts.find((a) => String(a.id) === card.accountId);
          const currentBal = parseFloat(selAccount?.theoreticalBalance ?? selAccount?.currentBalance ?? "0");
          const spend = parseFloat(card.spendAmount) || 0;
          const previewBal = selAccount && card.spendAmount ? (currentBal - spend).toFixed(2) : null;
          const fanNum = parseInt(card.fanCount) || 0;
          const gmvNum = parseFloat(card.gmv) || 0;
          const orderNum = parseInt(card.orderCount) || 0;
          const fanCost = card.businessType === "liveChat" && fanNum > 0 && spend > 0 ? (spend / fanNum).toFixed(4) : null;
          const roas = card.businessType === "ecommerce" && gmvNum > 0 && spend > 0 ? (gmvNum / spend).toFixed(2) : null;
          const avgOrder = card.businessType === "ecommerce" && gmvNum > 0 && orderNum > 0 ? (gmvNum / orderNum).toFixed(2) : null;
          const alreadyReported = card.accountId && reportedIds.has(Number(card.accountId)) && card.date === yesterday;

          return (
            <div key={card.key} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-muted-foreground">第 {idx + 1} 条</span>
                {cards.length > 1 && (
                  <button onClick={() => removeCard(card.key)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">账户 <span className="text-destructive">*</span></Label>
                  <Select value={card.accountId} onValueChange={(v) => updateCard(card.key, "accountId", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="选择账户..." /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.accountName}（{a.platform}）{reportedIds.has(a.id) ? " ✓" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {alreadyReported && <p className="text-xs text-amber-500">该账户今日已上报，提交将报错</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">日期 <span className="text-destructive">*</span></Label>
                  <Input type="date" className="h-8 text-xs" value={card.date} max={yesterday}
                    onChange={(e) => updateCard(card.key, "date", e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">今日消耗（美元）<span className="text-destructive">*</span></Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" className="h-8 text-sm"
                  value={card.spendAmount} onChange={(e) => updateCard(card.key, "spendAmount", e.target.value)} />
                {previewBal !== null && (
                  <p className="text-xs text-muted-foreground px-1">
                    <Info className="inline h-3 w-3 mr-0.5 mb-0.5" />
                    提交后余额将更新为 <span className="font-mono text-primary">${previewBal}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">投放业务（选填）</Label>
                <div className="flex gap-2">
                  {["", "liveChat", "ecommerce"].map((v) => (
                    <button key={v} onClick={() => updateCard(card.key, "businessType", v)}
                      className={["flex-1 text-xs py-1.5 rounded-md border transition-colors", card.businessType === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"].join(" ")}>
                      {v === "" ? "不填" : BIZ_LABELS[v]}
                    </button>
                  ))}
                </div>
              </div>

              {card.businessType === "liveChat" && (
                <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">服务团队</Label>
                    <Select value={card.teamId} onValueChange={(v) => updateCard(card.key, "teamId", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="选择团队..." /></SelectTrigger>
                      <SelectContent>{liveTeams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">进粉数量</Label>
                    <Input type="number" min="0" step="1" placeholder="0" className="h-8 text-xs"
                      value={card.fanCount} onChange={(e) => updateCard(card.key, "fanCount", e.target.value)} />
                    {fanCost && <p className="text-xs text-muted-foreground px-0.5">粉丝成本 <span className="font-mono text-green-600">${fanCost}</span></p>}
                  </div>
                </div>
              )}

              {card.businessType === "ecommerce" && (
                <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">GMV（美元）</Label>
                    <Input type="number" min="0" step="0.01" placeholder="0.00" className="h-8 text-xs"
                      value={card.gmv} onChange={(e) => updateCard(card.key, "gmv", e.target.value)} />
                    {roas && <p className="text-xs text-muted-foreground px-0.5">ROAS <span className="font-mono text-green-600">{roas}</span></p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">订单数</Label>
                    <Input type="number" min="0" step="1" placeholder="0" className="h-8 text-xs"
                      value={card.orderCount} onChange={(e) => updateCard(card.key, "orderCount", e.target.value)} />
                    {avgOrder && <p className="text-xs text-muted-foreground px-0.5">客单价 <span className="font-mono text-green-600">${avgOrder}</span></p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <Button className="w-full gap-2" onClick={handleSubmitAll} disabled={submitting}>
          {submitted ? (
            <><CheckCircle className="h-4 w-4" /> 已全部提交</>
          ) : submitting ? "提交中..." : (
            <><CheckCircle className="h-4 w-4" /> 全部提交（{cards.length} 条）</>
          )}
        </Button>
      </div>

      {/* ── 历史记录 ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">上报记录</h2>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Select value={accountFilter} onValueChange={(v) => { setAccountFilter(v); setHistoryPage(1); }}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部账户</SelectItem>
              {accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.accountName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1.5">上报日期</p>
          <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r); setHistoryPage(1); }} />
        </div>

        <StatsBar items={[
          { label: "上报条数", value: allStats.length },
          { label: "总消耗", value: `$${totalSpend.toFixed(2)}`, color: "blue" },
        ]} />

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>日期</TableHead>
                <TableHead>账户</TableHead>
                <TableHead>消耗</TableHead>
                <TableHead>余额</TableHead>
                <TableHead>业务</TableHead>
                <TableHead>团队</TableHead>
                <TableHead>运营指标</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statsLoading && Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 9 }).map((__, j) => (
                  <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-16" /></TableCell>
                ))}</TableRow>
              ))}
              {!statsLoading && pagedStats.length === 0 && (
                <TableRow><TableCell colSpan={9}><EmptyState icon={BarChart3} title="暂无上报记录" description="提交今日消耗数据后将在此显示。" /></TableCell></TableRow>
              )}
              {!statsLoading && pagedStats.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.date}</TableCell>
                  <TableCell className="max-w-[140px] text-sm font-medium"><TruncatedCell value={s.accountName ?? `#${s.accountId}`} /></TableCell>
                  <TableCell className="font-mono text-sm">${Number(s.spendAmount).toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-sm text-primary">${Number(s.realBalance).toFixed(2)}</TableCell>
                  <TableCell>
                    {s.businessType ? (
                      <Badge variant="outline" className="text-xs">{BIZ_LABELS[s.businessType] ?? s.businessType}</Badge>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.teamName ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {s.businessType === "liveChat" && s.fanCount != null ? (
                      <span>进粉 {s.fanCount}{s.fanCost ? ` · $${Number(s.fanCost).toFixed(2)}/粉` : ""}</span>
                    ) : s.businessType === "ecommerce" && s.gmv != null ? (
                      <span>GMV ${Number(s.gmv).toFixed(0)}{s.roas ? ` · ROAS ${Number(s.roas).toFixed(2)}` : ""}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {s.hasAlert
                      ? <Badge variant="destructive" className="text-xs">预警</Badge>
                      : <Badge variant="outline" className="text-xs text-muted-foreground">正常</Badge>}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => setEditTarget(s)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={historyPage} pageSize={PAGE_SIZE} total={allStats.length} onPageChange={setHistoryPage} />
        </div>
      </div>

      {editTarget && (
        <EditStatDialog stat={editTarget} accounts={accounts} teams={teams} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}
