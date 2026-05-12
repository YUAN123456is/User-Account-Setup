import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Key, Plus, Trash2, RefreshCw, CheckCircle, XCircle,
  Link2, Unlink, AlertCircle, ChevronDown, ChevronRight, Pencil,
  Play, Loader2,
} from "lucide-react";

interface MetaToken {
  id: number; label: string; isActive: boolean;
  lastSyncAt: string | null; lastSyncResult: string | null; createdAt: string;
}

interface FbAccount {
  fbAccountId: string; fbAccountName: string;
  tokenId: number; tokenLabel: string;
  matchedAccountId: number | null; matchedAccountName: string | null;
}

interface SystemAccount { id: number; accountName: string; platformAccountId: string; }

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) { const e = await res.json() as { error: string }; throw new Error(e.error); }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export default function PitcherMetaTokensPage() {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<MetaToken[]>([]);
  const [fbAccounts, setFbAccounts] = useState<FbAccount[]>([]);
  const [systemAccounts, setSystemAccounts] = useState<SystemAccount[]>([]);
  const [fbErrors, setFbErrors] = useState<string[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [loadingFb, setLoadingFb] = useState(false);

  // Token dialog
  const [tokenDialog, setTokenDialog] = useState<{ open: boolean; editing: MetaToken | null }>({ open: false, editing: null });
  const [tokenLabel, setTokenLabel] = useState("");
  const [tokenValue, setTokenValue] = useState("");
  const [savingToken, setSavingToken] = useState(false);

  // Matching
  const [matchSelect, setMatchSelect] = useState<Record<string, string>>({}); // fbAccountId → systemAccountId string
  const [savingMatch, setSavingMatch] = useState<string | null>(null);
  const [expandedTokens, setExpandedTokens] = useState<Set<number>>(new Set());

  const loadTokens = useCallback(async () => {
    setLoadingTokens(true);
    try { setTokens(await api<MetaToken[]>("/api/pitcher/meta-tokens")); }
    catch { /* silent */ }
    finally { setLoadingTokens(false); }
  }, []);

  const loadFbAccounts = useCallback(async () => {
    setLoadingFb(true);
    try {
      const data = await api<{ accounts: FbAccount[]; systemAccounts: SystemAccount[]; errors: string[] }>("/api/pitcher/meta-tokens/fb-accounts");
      setFbAccounts(data.accounts);
      setSystemAccounts(data.systemAccounts);
      setFbErrors(data.errors);
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "加载失败"), variant: "destructive" });
    } finally { setLoadingFb(false); }
  }, [toast]);

  useEffect(() => { void loadTokens(); }, [loadTokens]);

  // Group FB accounts by token
  const byToken: Record<number, FbAccount[]> = {};
  for (const fa of fbAccounts) {
    if (!byToken[fa.tokenId]) byToken[fa.tokenId] = [];
    byToken[fa.tokenId].push(fa);
  }

  function openAddToken() { setTokenLabel(""); setTokenValue(""); setTokenDialog({ open: true, editing: null }); }
  function openEditToken(t: MetaToken) { setTokenLabel(t.label); setTokenValue(""); setTokenDialog({ open: true, editing: t }); }

  async function saveToken() {
    setSavingToken(true);
    try {
      if (tokenDialog.editing) {
        const body: Record<string, unknown> = { label: tokenLabel };
        if (tokenValue.trim()) body.accessToken = tokenValue.trim();
        await api("/api/pitcher/meta-tokens/" + tokenDialog.editing.id, { method: "PUT", body: JSON.stringify(body) });
        toast({ title: "Token 已更新" });
      } else {
        if (!tokenValue.trim()) { toast({ title: "请填写 Access Token", variant: "destructive" }); return; }
        await api("/api/pitcher/meta-tokens", { method: "POST", body: JSON.stringify({ label: tokenLabel, accessToken: tokenValue }) });
        toast({ title: "Token 已添加" });
      }
      setTokenDialog({ open: false, editing: null });
      await loadTokens();
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "操作失败"), variant: "destructive" });
    } finally { setSavingToken(false); }
  }

  async function toggleActive(t: MetaToken) {
    try {
      await api("/api/pitcher/meta-tokens/" + t.id, { method: "PUT", body: JSON.stringify({ isActive: !t.isActive }) });
      await loadTokens();
    } catch (e) { toast({ title: String(e instanceof Error ? e.message : "操作失败"), variant: "destructive" }); }
  }

  async function deleteToken(t: MetaToken) {
    if (!confirm(`确认删除 Token「${t.label}」？`)) return;
    try {
      await api("/api/pitcher/meta-tokens/" + t.id, { method: "DELETE" });
      await loadTokens();
      toast({ title: "Token 已删除" });
    } catch (e) { toast({ title: String(e instanceof Error ? e.message : "删除失败"), variant: "destructive" }); }
  }

  async function saveMatch(fbAcc: FbAccount) {
    const val = matchSelect[fbAcc.fbAccountId];
    if (!val) return;
    setSavingMatch(fbAcc.fbAccountId);
    try {
      if (val === "__unlink__") {
        if (!fbAcc.matchedAccountId) { setSavingMatch(null); return; }
        await api("/api/pitcher/meta-tokens/unmatch", { method: "POST", body: JSON.stringify({ systemAccountId: fbAcc.matchedAccountId }) });
      } else {
        await api("/api/pitcher/meta-tokens/match", { method: "POST", body: JSON.stringify({ fbAccountId: fbAcc.fbAccountId, systemAccountId: parseInt(val, 10) }) });
      }
      toast({ title: "匹配已保存" });
      await loadFbAccounts();
      setMatchSelect((prev) => { const n = { ...prev }; delete n[fbAcc.fbAccountId]; return n; });
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "保存失败"), variant: "destructive" });
    } finally { setSavingMatch(null); }
  }

  function toggleExpand(tokenId: number) {
    setExpandedTokens((prev) => {
      const next = new Set(prev);
      next.has(tokenId) ? next.delete(tokenId) : next.add(tokenId);
      return next;
    });
  }

  const hasActiveToken = tokens.some((t) => t.isActive);

  // Sync panel state
  const defaultDate = (() => { const d = new Date(Date.now() - 8 * 60 * 60 * 1000); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const [syncDate, setSyncDate] = useState(defaultDate);
  const [syncing, setSyncing] = useState(false);
  interface SyncResult { synced: number; matched: number; unmatched: number; errors: string[]; results: Array<{ date: string; accounts: Array<{ fbAccountId: string; fbAccountName: string; spend: string; matched: boolean; systemAccountName?: string }> }> }
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  async function runSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const data = await api<SyncResult>("/api/pitcher/meta-tokens/sync", {
        method: "POST",
        body: JSON.stringify({ date: syncDate }),
      });
      setSyncResult(data);
      if (data.errors.length === 0) {
        toast({ title: `同步完成：${data.matched} 个账户写入数据` });
      } else {
        toast({ title: "同步完成（含错误）", variant: "destructive" });
      }
      await loadTokens();
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "同步失败"), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-white">Facebook 账号配置</h1>
        <p className="text-sm text-muted-foreground mt-0.5">配置 Token 并将 Facebook 广告账号与系统账号匹配，用于自动同步消耗数据</p>
      </div>

      {/* Tokens section */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Access Token 管理</span>
          </div>
          <Button size="sm" onClick={openAddToken} className="gap-1.5 h-8">
            <Plus className="h-3.5 w-3.5" />添加 Token
          </Button>
        </div>

        {tokens.length === 0 && !loadingTokens ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            暂无 Token，点击右上角「添加 Token」开始配置
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{t.label}</span>
                    <Badge variant={t.isActive ? "default" : "secondary"} className="text-xs h-4 px-1.5">
                      {t.isActive ? "启用" : "停用"}
                    </Badge>
                  </div>
                  {t.lastSyncResult && (
                    <p className={`text-xs mt-0.5 truncate ${t.lastSyncResult.startsWith("失败") ? "text-red-400" : "text-muted-foreground"}`}>
                      {t.lastSyncAt ? new Date(t.lastSyncAt).toLocaleString("zh-CN") + " · " : ""}
                      {t.lastSyncResult}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditToken(t)} title="编辑">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(t)} title={t.isActive ? "停用" : "启用"}>
                    {t.isActive ? <XCircle className="h-3.5 w-3.5 text-yellow-500" /> : <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteToken(t)} title="删除">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sync section */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">同步消耗数据</span>
            <span className="text-xs text-muted-foreground">从 Facebook 拉取指定日期的广告消耗写入日报</span>
          </div>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">同步日期</label>
              <input
                type="date"
                value={syncDate}
                onChange={(e) => setSyncDate(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button
              size="sm"
              className="gap-1.5 h-8"
              disabled={!hasActiveToken || syncing || !syncDate}
              onClick={runSync}
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {syncing ? "同步中..." : "立即同步"}
            </Button>
            {!hasActiveToken && (
              <span className="text-xs text-muted-foreground">请先添加并启用 Token</span>
            )}
          </div>

          {syncResult && (
            <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
              <div className="flex items-center gap-6 px-4 py-3 text-sm">
                <span className="text-muted-foreground text-xs">拉取账户</span>
                <span className="font-semibold">{syncResult.synced}</span>
                <span className="text-muted-foreground text-xs">写入日报</span>
                <span className={`font-semibold ${syncResult.matched > 0 ? "text-emerald-500" : ""}`}>{syncResult.matched}</span>
                {syncResult.unmatched > 0 && <>
                  <span className="text-muted-foreground text-xs">未匹配</span>
                  <span className="font-semibold text-amber-500">{syncResult.unmatched}</span>
                </>}
              </div>
              {syncResult.errors.length > 0 && (
                <div className="px-4 py-3 space-y-1">
                  {syncResult.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-red-400">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{e}
                    </div>
                  ))}
                </div>
              )}
              {syncResult.results[0]?.accounts.filter((a) => a.matched && Number(a.spend) > 0).length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-2">已写入账户</p>
                  <div className="space-y-1">
                    {syncResult.results[0].accounts.filter((a) => a.matched && Number(a.spend) > 0).map((a) => (
                      <div key={a.fbAccountId} className="flex items-center justify-between text-xs">
                        <span className="text-foreground truncate max-w-[240px]">{a.systemAccountName ?? a.fbAccountName}</span>
                        <span className="font-mono text-primary ml-4">${Number(a.spend).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Matching section */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">账号匹配</span>
            <span className="text-xs text-muted-foreground">将 Facebook 广告账号与系统账号对应</span>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 h-8" disabled={!hasActiveToken || loadingFb} onClick={loadFbAccounts}>
            <RefreshCw className={`h-3.5 w-3.5 ${loadingFb ? "animate-spin" : ""}`} />
            {loadingFb ? "加载中..." : "拉取账号"}
          </Button>
        </div>

        {fbErrors.length > 0 && (
          <div className="px-5 py-3 border-b border-border space-y-1">
            {fbErrors.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />{e}
              </div>
            ))}
          </div>
        )}

        {fbAccounts.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            {hasActiveToken ? "点击「拉取账号」从 Facebook 获取广告账号列表" : "请先添加并启用至少一个 Token"}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Group by token */}
            {tokens.filter((t) => byToken[t.id]?.length).map((t) => (
              <div key={t.id}>
                <button
                  className="w-full flex items-center gap-2 px-5 py-3 hover:bg-muted/30 transition-colors text-left"
                  onClick={() => toggleExpand(t.id)}
                >
                  <span className="text-muted-foreground">
                    {expandedTokens.has(t.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </span>
                  <Key className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className="text-xs text-muted-foreground ml-1">({byToken[t.id]?.length ?? 0} 个账号)</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {byToken[t.id]?.filter((a) => a.matchedAccountId).length ?? 0} 已匹配
                  </span>
                </button>

                {(expandedTokens.has(t.id)) && (
                  <div className="divide-y divide-border/50 bg-muted/10">
                    {(byToken[t.id] ?? []).map((fbAcc) => {
                      const currentSelect = matchSelect[fbAcc.fbAccountId];
                      const isMatched = !!fbAcc.matchedAccountId;
                      const isSaving = savingMatch === fbAcc.fbAccountId;

                      return (
                        <div key={fbAcc.fbAccountId} className="flex items-center gap-3 px-6 py-3">
                          {/* FB account */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{fbAcc.fbAccountName}</p>
                            <p className="text-xs text-muted-foreground font-mono">act_{fbAcc.fbAccountId}</p>
                          </div>

                          {/* Arrow */}
                          <div className="text-muted-foreground/40 shrink-0">→</div>

                          {/* System account select */}
                          <div className="w-48 shrink-0">
                            <Select
                              value={currentSelect ?? (fbAcc.matchedAccountId ? String(fbAcc.matchedAccountId) : "__none__")}
                              onValueChange={(v) => setMatchSelect((prev) => ({ ...prev, [fbAcc.fbAccountId]: v }))}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="选择系统账号" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— 不匹配 —</SelectItem>
                                {isMatched && <SelectItem value="__unlink__">取消匹配</SelectItem>}
                                {systemAccounts.map((sa) => (
                                  <SelectItem key={sa.id} value={String(sa.id)}>
                                    {sa.accountName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Status + save */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isMatched && !currentSelect ? (
                              <CheckCircle className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <div className="h-4 w-4" />
                            )}
                            {currentSelect && currentSelect !== "__none__" && currentSelect !== String(fbAcc.matchedAccountId) ? (
                              <Button size="sm" className="h-7 text-xs px-2.5" onClick={() => saveMatch(fbAcc)} disabled={isSaving}>
                                {isSaving ? "保存..." : "确认"}
                              </Button>
                            ) : currentSelect === "__unlink__" ? (
                              <Button size="sm" variant="destructive" className="h-7 text-xs px-2.5 gap-1" onClick={() => saveMatch(fbAcc)} disabled={isSaving}>
                                <Unlink className="h-3 w-3" />{isSaving ? "..." : "取消"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Token dialog */}
      <Dialog open={tokenDialog.open} onOpenChange={(o) => !o && setTokenDialog({ open: false, editing: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tokenDialog.editing ? "编辑 Token" : "添加 Token"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">名称 <span className="text-destructive">*</span></Label>
              <Input value={tokenLabel} onChange={(e) => setTokenLabel(e.target.value)} placeholder="例：我的主号" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">
                Access Token <span className="text-destructive">*</span>
                {tokenDialog.editing && <span className="text-muted-foreground font-normal ml-1">（不填则保持原 Token 不变）</span>}
              </Label>
              <Input
                value={tokenValue}
                onChange={(e) => setTokenValue(e.target.value)}
                placeholder="EAAxxxxxxx..."
                type="password"
              />
              <p className="text-xs text-muted-foreground">
                在 Meta 开发者后台 → Graph API Explorer 生成，需要 <code>ads_read</code> 权限
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialog({ open: false, editing: null })}>取消</Button>
            <Button onClick={saveToken} disabled={savingToken || !tokenLabel.trim()}>
              {savingToken ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
