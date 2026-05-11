import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import ProviderReportPage from "@/pages/admin/ProviderReportPage";
import PitcherReportPage from "@/pages/admin/PitcherReportPage";
import OpsReportPage from "@/pages/admin/OpsReportPage";
import CrossReportPage from "@/pages/admin/CrossReportPage";
import { RefreshCw, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

type Tab = "provider" | "pitcher" | "ops" | "cross";

const TABS: { id: Tab; label: string }[] = [
  { id: "provider", label: "开户商" },
  { id: "pitcher", label: "投手" },
  { id: "ops", label: "运营" },
  { id: "cross", label: "交叉" },
];

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

interface SyncAccountResult {
  fbAccountId: string;
  fbAccountName: string;
  spend: string;
  matched: boolean;
  systemAccountName?: string;
}

interface SyncDayResult {
  date: string;
  synced: number;
  matched: number;
  unmatched: number;
  errors: string[];
  accounts: SyncAccountResult[];
}

interface SyncResult {
  dateFrom: string;
  dateTo: string;
  days: number;
  synced: number;
  matched: number;
  unmatched: number;
  errors: string[];
  results: SyncDayResult[];
}

function FbSyncPanel() {
  const yd = yesterday();
  const [dateFrom, setDateFrom] = useState(yd);
  const [dateTo, setDateTo] = useState(yd);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/meta-tokens/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      if (!res.ok) throw new Error(`请求失败 (${res.status})`);
      const data = await res.json() as SyncResult;
      setResult(data);
      setShowDetail(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "同步失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <RefreshCw className={cn("h-4 w-4 text-blue-400 shrink-0", loading && "animate-spin")} />
            <span className="text-sm font-medium text-blue-300">Facebook 数据同步</span>
            <span className="text-xs text-muted-foreground hidden sm:block">每日凌晨 2:00 自动同步昨日数据</span>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0"
          >
            手动同步 {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {expanded && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">开始日期</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 w-36 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">结束日期</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 w-36 text-xs"
                />
              </div>
              <Button
                size="sm"
                onClick={handleSync}
                disabled={loading || !dateFrom || !dateTo}
                className="h-8 text-xs"
              >
                {loading ? (
                  <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />同步中...</>
                ) : (
                  <><RefreshCw className="h-3 w-3 mr-1.5" />开始同步</>
                )}
              </Button>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {result && (
              <div className="space-y-2">
                <div className="flex items-center gap-4 rounded-lg bg-card border border-border px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <div className="flex gap-4 text-xs flex-wrap">
                    <span>共 <b className="text-foreground">{result.days}</b> 天</span>
                    <span>拉取 <b className="text-foreground">{result.synced}</b> 条</span>
                    <span className="text-emerald-400">匹配写入 <b>{result.matched}</b></span>
                    {result.unmatched > 0 && (
                      <span className="text-amber-400">未匹配 <b>{result.unmatched}</b>（无对应系统账户）</span>
                    )}
                    {result.errors.length > 0 && (
                      <span className="text-red-400">失败 <b>{result.errors.length}</b> 个 Token</span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowDetail((v) => !v)}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground shrink-0"
                  >
                    {showDetail ? "收起" : "详情"}
                  </button>
                </div>

                {showDetail && result.results.map((day) => (
                  <div key={day.date} className="rounded-lg border border-border overflow-hidden">
                    <div className="bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">{day.date}</div>
                    <div className="divide-y divide-border">
                      {day.accounts.map((acc) => (
                        <div key={acc.fbAccountId} className="flex items-center justify-between px-3 py-1.5 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            {acc.matched
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              : <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            }
                            <span className="truncate text-muted-foreground">{acc.fbAccountName}</span>
                            {acc.matched && acc.systemAccountName && (
                              <span className="text-emerald-400 shrink-0">→ {acc.systemAccountName}</span>
                            )}
                            {!acc.matched && (
                              <span className="text-amber-400 shrink-0">未匹配</span>
                            )}
                          </div>
                          <span className="font-mono text-orange-400 shrink-0 ml-2">${Number(acc.spend).toFixed(2)}</span>
                        </div>
                      ))}
                      {day.errors.map((e, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>{e}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("provider");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">报表</h1>
        <p className="text-sm text-muted-foreground mt-0.5">多维度消耗与运营数据</p>
      </div>

      <FbSyncPanel />

      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              tab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "provider" && <ProviderReportPage />}
      {tab === "pitcher" && <PitcherReportPage />}
      {tab === "ops" && <OpsReportPage />}
      {tab === "cross" && <CrossReportPage />}
    </div>
  );
}
