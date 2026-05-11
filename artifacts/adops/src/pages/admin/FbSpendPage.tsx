import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { StatsBar } from "@/components/shared/StatsBar";
import {
  RefreshCw, CheckCircle, XCircle, Facebook, AlertCircle,
} from "lucide-react";

interface SpendRow {
  id: number;
  date: string;
  fbAccountId: string;
  fbAccountName: string;
  spend: string;
  currency: string;
  matchedAccountId: number | null;
  matchedAccountName: string | null;
  syncedAt: string;
}

interface SyncResult {
  date: string;
  synced: number;
  matched: number;
  unmatched: number;
  errors: string[];
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) { const e = await res.json() as { error: string }; throw new Error(e.error); }
  return res.json();
}

export default function FbSpendPage() {
  const { toast } = useToast();
  const [date, setDate] = useState(yesterday);
  const [rows, setRows] = useState<SpendRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const loadSpend = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const data = await api<SpendRow[]>(`/api/meta-tokens/spend?date=${d}`);
      setRows(data);
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "加载失败"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void loadSpend(date); }, [date, loadSpend]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api<SyncResult>("/api/meta-tokens/sync", {
        method: "POST",
        body: JSON.stringify({ date }),
      });
      setLastResult(result);
      if (result.errors.length > 0) {
        toast({ title: `同步完成，${result.errors.length} 个 Token 出错`, variant: "destructive" });
      } else {
        toast({ title: `同步成功：${result.synced} 个账号，${result.matched} 个已匹配写入每日上报` });
      }
      await loadSpend(date);
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "同步失败"), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const matched = rows.filter((r) => r.matchedAccountId !== null);
  const unmatched = rows.filter((r) => r.matchedAccountId === null);
  const totalSpend = rows.reduce((s, r) => s + parseFloat(r.spend || "0"), 0);
  const matchedSpend = matched.reduce((s, r) => s + parseFloat(r.spend || "0"), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Facebook className="h-5 w-5 text-blue-500" />
            Facebook 消耗数据
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            从 Facebook 拉取广告消耗，已匹配账号自动写入每日上报
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 w-36 text-sm"
          />
          <Button onClick={handleSync} disabled={syncing} className="gap-1.5 h-8">
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "同步中..." : "立即同步"}
          </Button>
        </div>
      </div>

      <StatsBar items={[
        { label: "FB账号总数", value: rows.length },
        { label: "已匹配", value: matched.length, color: "green" },
        { label: "未匹配", value: unmatched.length, color: unmatched.length > 0 ? "amber" : undefined },
        { label: "总消耗", value: `$${totalSpend.toFixed(2)}`, color: "blue" },
        { label: "已匹配消耗", value: `$${matchedSpend.toFixed(2)}`, color: "purple" },
      ]} />

      {lastResult && lastResult.errors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 space-y-1">
          {lastResult.errors.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{e}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">FB 广告账号</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">账号 ID</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">消耗</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">匹配状态</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">对应系统账号</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">同步时间</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-border/40">
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j} className="px-4 py-2.5">
                    <div className="h-4 bg-muted animate-pulse rounded w-24" />
                  </td>
                ))}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  暂无数据，请先点击「立即同步」拉取
                </td>
              </tr>
            )}
            {!loading && rows.map((row, idx) => (
              <tr key={row.id} className={`border-b border-border/40 last:border-0 ${idx % 2 === 1 ? "bg-muted/20" : ""}`}>
                <td className="px-4 py-2.5 font-medium max-w-[200px] truncate">{row.fbAccountName}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">act_{row.fbAccountId}</td>
                <td className="px-4 py-2.5 font-mono font-semibold text-right text-orange-500">
                  ${parseFloat(row.spend).toFixed(2)}
                  <span className="text-xs text-muted-foreground ml-1">{row.currency}</span>
                </td>
                <td className="px-4 py-2.5">
                  {row.matchedAccountId ? (
                    <Badge variant="outline" className="gap-1 text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-xs">
                      <CheckCircle className="h-3 w-3" />已匹配
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500/30 bg-amber-500/10 text-xs">
                      <XCircle className="h-3 w-3" />未匹配
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 text-sm text-muted-foreground">
                  {row.matchedAccountName ?? <span className="italic text-muted-foreground/50">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(row.syncedAt).toLocaleString("zh-CN", {
                    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && unmatched.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <p className="text-sm text-amber-600 font-medium mb-1">
            {unmatched.length} 个 FB 账号未匹配到系统账号
          </p>
          <p className="text-xs text-muted-foreground">
            请让对应投手前往「FB 账号配置」页面完成匹配，下次同步后消耗将自动写入每日上报。
          </p>
        </div>
      )}
    </div>
  );
}
