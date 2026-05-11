import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListAccounts, useUpdateAccount, createAccount, getListAccountsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountStatusBadge, PlatformBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { useToast } from "@/hooks/use-toast";
import { Plus, CreditCard, Search, Trash2, PlusCircle, ClipboardPaste, CheckCircle, XCircle, Loader2, AlertTriangle, CheckCheck } from "lucide-react";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { cn } from "@/lib/utils";

interface Account {
  id: number;
  platformAccountId: string;
  accountName: string;
  platform: string;
  status: "idle" | "active" | "banned";
  currentBalance: string;
  lastReportedAt?: string | null;
  createdAt: string;
  banNotifyProvider?: boolean;
}

const PLATFORMS = [
  { value: "FB", label: "Facebook" },
  { value: "GG", label: "Google" },
  { value: "TT", label: "TikTok" },
  { value: "TW", label: "Twitter" },
  { value: "OTHER", label: "其他" },
];

type Platform = "FB" | "GG" | "TT" | "TW" | "OTHER";
const PAGE_SIZE = 20;

interface RowDraft {
  id: string;
  accountName: string;
  platformAccountId: string;
  platform: Platform;
  initialBalance: string;
  status: "idle" | "success" | "error" | "loading";
  errorMsg?: string;
}

function detectPlatform(name: string): Platform {
  const upper = name.toUpperCase();
  if (/\bFB\b/.test(upper)) return "FB";
  if (/\bGG\b/.test(upper)) return "GG";
  if (/\bTT\b/.test(upper)) return "TT";
  if (/\bTW\b/.test(upper)) return "TW";
  return "OTHER";
}

function parsePastedText(raw: string): RowDraft[] {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows: RowDraft[] = [];
  let i = 0;
  while (i < lines.length) {
    const nameLine = lines[i];
    const idLine = lines[i + 1] ?? "";

    const accountName = nameLine.trim();

    let platformAccountId = "";
    let consumed = 1;
    if (/^编号[：:]/.test(idLine)) {
      platformAccountId = idLine.replace(/^编号[：:]\s*/, "").trim();
      consumed = 2;
    } else if (/^\d{8,}$/.test(idLine)) {
      platformAccountId = idLine.trim();
      consumed = 2;
    }

    if (accountName) {
      rows.push({
        id: crypto.randomUUID(),
        accountName,
        platformAccountId,
        platform: detectPlatform(accountName),
        initialBalance: "0.00",
        status: "idle",
      });
    }
    i += consumed;
  }
  return rows;
}

function blankRow(): RowDraft {
  return { id: crypto.randomUUID(), accountName: "", platformAccountId: "", platform: "OTHER", initialBalance: "0.00", status: "idle" };
}

function BatchCreateAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows] = useState<RowDraft[]>([blankRow()]);
  const [globalPlatform, setGlobalPlatform] = useState<Platform | "auto">("auto");
  const [globalBalance, setGlobalBalance] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setPasteText("");
      setRows([blankRow()]);
      setGlobalPlatform("auto");
      setGlobalBalance("");
    }
  }, [open]);

  const handleParse = useCallback(() => {
    if (!pasteText.trim()) return;
    const parsed = parsePastedText(pasteText);
    if (parsed.length === 0) {
      toast({ title: "解析失败", description: "未识别到有效账户数据，请检查格式。", variant: "destructive" });
      return;
    }
    setRows(parsed);
    setPasteText("");
    toast({ title: `解析成功`, description: `识别到 ${parsed.length} 个账户，请确认信息后提交。` });
  }, [pasteText, toast]);

  const updateRow = (id: string, field: keyof RowDraft, value: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value, status: "idle", errorMsg: undefined } : r));
  };

  const deleteRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addRow = () => setRows((prev) => [...prev, blankRow()]);

  const applyGlobal = () => {
    setRows((prev) => prev.map((r) => ({
      ...r,
      ...(globalPlatform !== "auto" ? { platform: globalPlatform } : {}),
      ...(globalBalance !== "" ? { initialBalance: globalBalance } : {}),
    })));
  };

  const validRows = rows.filter((r) => r.accountName.trim() && r.platformAccountId.trim());
  const doneCount = rows.filter((r) => r.status === "success").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  const handleSubmit = async () => {
    const invalids = rows.filter((r) => !r.accountName.trim() || !r.platformAccountId.trim());
    if (invalids.length > 0) {
      toast({ title: "有未填写的行", description: "账户名称和广告编号为必填项，请填写完整或删除空行。", variant: "destructive" });
      return;
    }
    if (rows.length === 0) return;

    setSubmitting(true);
    setRows((prev) => prev.map((r) => ({ ...r, status: "loading", errorMsg: undefined })));

    let successCount = 0;
    const updatedRows = [...rows];

    for (let i = 0; i < updatedRows.length; i++) {
      const r = updatedRows[i];
      const balance = parseFloat(r.initialBalance);
      try {
        await createAccount({
          accountName: r.accountName.trim(),
          platformAccountId: r.platformAccountId.trim(),
          platform: r.platform,
          initialBalance: isNaN(balance) ? "0.00" : balance.toFixed(2),
        });
        updatedRows[i] = { ...r, status: "success" };
        successCount++;
      } catch (err: unknown) {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "创建失败";
        updatedRows[i] = { ...r, status: "error", errorMsg: msg };
      }
      setRows([...updatedRows]);
    }

    setSubmitting(false);
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });

    const failCount = updatedRows.filter((r) => r.status === "error").length;
    if (failCount === 0) {
      toast({ title: `全部添加成功`, description: `${successCount} 个账户已创建。` });
      onClose();
    } else {
      toast({
        title: `部分添加成功`,
        description: `${successCount} 成功 / ${failCount} 失败，请检查标红的行。`,
        variant: "destructive",
      });
      setRows(updatedRows.filter((r) => r.status !== "success"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={submitting ? undefined : onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>批量新增广告账户</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ClipboardPaste className="h-4 w-4 text-muted-foreground" />
              粘贴文本自动解析
              <span className="text-xs text-muted-foreground font-normal">（支持「#编号 - 账户名称 / 编号：ID」格式，每对两行）</span>
            </div>
            <Textarea
              placeholder={`粘贴账户数据，例如：\n#1210 - AdTiger-JLBY-016 8754 - PP - RHKA\n编号：1545161920944125\n#5146 - AdTiger-JLBY-018 8752 - PP - RHKA\n编号：1283427706567973`}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="text-xs font-mono min-h-[100px] resize-y"
              disabled={submitting}
            />
            <Button type="button" size="sm" onClick={handleParse} disabled={!pasteText.trim() || submitting} className="gap-1.5">
              <ClipboardPaste className="h-4 w-4" />
              解析并填入表格
            </Button>
          </div>

          {rows.length > 1 && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <span className="text-xs text-muted-foreground whitespace-nowrap pt-5">批量设置</span>
              <div className="space-y-1">
                <Label className="text-xs">平台</Label>
                <Select value={globalPlatform} onValueChange={(v) => setGlobalPlatform(v as Platform | "auto")} disabled={submitting}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">保持不变</SelectItem>
                    {PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">初始余额（USD）</Label>
                <Input
                  type="number" min="0" step="0.01" placeholder="留空不修改"
                  value={globalBalance}
                  onChange={(e) => setGlobalBalance(e.target.value)}
                  className="h-8 w-36 text-xs"
                  disabled={submitting}
                />
              </div>
              <Button type="button" size="sm" variant="outline" onClick={applyGlobal} disabled={submitting} className="text-xs">
                应用到全部行
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-8">#</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">账户名称 <span className="text-destructive">*</span></th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">广告编号 <span className="text-destructive">*</span></th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-32">平台</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-28">初始余额</th>
                  <th className="w-16 px-3 py-2 text-xs font-medium text-muted-foreground text-right">状态</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors",
                      row.status === "success" && "bg-green-500/5",
                      row.status === "error" && "bg-destructive/5",
                      row.status === "loading" && "opacity-60",
                    )}
                  >
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{idx + 1}</td>
                    <td className="px-1.5 py-1.5">
                      <div className="space-y-0.5">
                        <Input
                          value={row.accountName}
                          onChange={(e) => updateRow(row.id, "accountName", e.target.value)}
                          placeholder="账户名称"
                          className="h-7 text-xs"
                          disabled={submitting}
                        />
                        {row.status === "error" && row.errorMsg && (
                          <p className="text-xs text-destructive px-1">{row.errorMsg}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-1.5 py-1.5">
                      <Input
                        value={row.platformAccountId}
                        onChange={(e) => updateRow(row.id, "platformAccountId", e.target.value)}
                        placeholder="如：1545161920944125"
                        className="h-7 text-xs font-mono"
                        disabled={submitting}
                      />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <Select value={row.platform} onValueChange={(v) => updateRow(row.id, "platform", v)} disabled={submitting}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-1.5 py-1.5">
                      <Input
                        type="number" min="0" step="0.01"
                        value={row.initialBalance}
                        onChange={(e) => updateRow(row.id, "initialBalance", e.target.value)}
                        className="h-7 text-xs w-full"
                        disabled={submitting}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {row.status === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}
                      {row.status === "success" && <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />}
                      {row.status === "error" && <XCircle className="h-4 w-4 text-destructive ml-auto" />}
                      {row.status === "idle" && (
                        <button
                          type="button"
                          onClick={() => deleteRow(row.id)}
                          disabled={submitting}
                          className="text-muted-foreground hover:text-destructive transition-colors ml-auto block"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={submitting} className="gap-1.5 text-xs">
            <PlusCircle className="h-4 w-4" />
            手动添加一行
          </Button>
        </div>

        <DialogFooter className="border-t border-border pt-4 mt-2 flex-shrink-0">
          <div className="flex items-center gap-2 mr-auto text-xs text-muted-foreground">
            {submitting ? (
              <span>正在提交… {doneCount}/{rows.length + doneCount + errorCount}</span>
            ) : (
              <span>共 {rows.length} 行 · {validRows.length} 行有效</span>
            )}
          </div>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>取消</Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || rows.length === 0} className="gap-1.5">
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" />提交中…</>
              : <><Plus className="h-4 w-4" />批量提交 {rows.length} 个账户</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClearBalanceRow({ account }: { account: Account }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const update = useUpdateAccount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
        toast({ title: "已确认清零", description: `账户「${account.accountName}」余额已清零。` });
      },
      onError: () => {
        toast({ title: "操作失败", variant: "destructive" });
      },
    },
  });

  return (
    <div className="flex items-center justify-between gap-3 bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-destructive truncate">{account.accountName}</p>
          <p className="text-xs text-muted-foreground font-mono">{account.platformAccountId} · 当前余额 ${Number(account.currentBalance).toFixed(2)}</p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 flex-shrink-0"
        onClick={() => update.mutate({ id: account.id, data: { clearBalance: true } })}
        disabled={update.isPending}
      >
        {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
        确认已清零
      </Button>
    </div>
  );
}

export default function ProviderAccountsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);

  const { data, isLoading } = useListAccounts({});
  const allAccounts = Array.isArray(data) ? (data as unknown as Account[]) : [];

  const bannedPendingClear = allAccounts.filter((a) => a.banNotifyProvider);

  const filtered = useMemo(() => {
    let rows = allAccounts;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((a) => a.accountName.toLowerCase().includes(q) || a.platformAccountId.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") rows = rows.filter((a) => a.status === statusFilter);
    if (platformFilter !== "all") rows = rows.filter((a) => a.platform === platformFilter);
    if (dateRange.from) rows = rows.filter((a) => a.createdAt >= dateRange.from);
    if (dateRange.to) rows = rows.filter((a) => a.createdAt <= dateRange.to + "T23:59:59");
    return rows;
  }, [allAccounts, search, statusFilter, platformFilter, dateRange]);

  const paged = usePagination(filtered, PAGE_SIZE, page);

  const activeCount = filtered.filter((a) => a.status === "active").length;
  const idleCount = filtered.filter((a) => a.status === "idle").length;
  const bannedCount = filtered.filter((a) => a.status === "banned").length;
  const totalBalance = filtered.reduce((s, a) => s + Number(a.currentBalance), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">我的账户</h1>
          <p className="text-sm text-muted-foreground mt-0.5">您名下的广告账户列表</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> 新增账户
        </Button>
      </div>

      {bannedPendingClear.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-destructive font-medium text-sm">
            <AlertTriangle className="h-4 w-4" />
            以下账户已被封禁，请将余额清零后点击确认
          </div>
          <div className="space-y-2">
            {bannedPendingClear.map((a) => (
              <ClearBalanceRow key={a.id} account={a} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 w-56 text-sm" placeholder="搜索账户名称或ID..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="idle">空闲</SelectItem>
            <SelectItem value="active">运行中</SelectItem>
            <SelectItem value="banned">已封禁</SelectItem>
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部平台</SelectItem>
            {PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">创建</span>
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => { setDateRange((r) => ({ ...r, from: e.target.value })); setPage(1); }}
            className="h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">至</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => { setDateRange((r) => ({ ...r, to: e.target.value })); setPage(1); }}
            className="h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {(dateRange.from || dateRange.to) && (
            <button
              onClick={() => { setDateRange({ from: "", to: "" }); setPage(1); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              清除
            </button>
          )}
        </div>
      </div>

      <StatsBar items={[
        { label: "账户总数", value: filtered.length },
        { label: "运行中", value: activeCount, color: activeCount > 0 ? "green" : "default" },
        { label: "空闲", value: idleCount, color: "amber" },
        { label: "已封禁", value: bannedCount, color: bannedCount > 0 ? "red" : "default" },
        { label: "账户余额合计", value: `$${totalBalance.toFixed(2)}`, color: "blue" },
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>账户名称</TableHead>
              <TableHead>平台账户ID</TableHead>
              <TableHead>平台</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>余额</TableHead>
              <TableHead>最近上报</TableHead>
              <TableHead>创建时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={7}><EmptyState icon={CreditCard} title="暂无账户" description="点击右上角「新增账户」开始添加您的广告账户。" /></TableCell></TableRow>
            )}
            {!isLoading && paged.map((a) => (
              <TableRow key={a.id} className={a.banNotifyProvider ? "bg-destructive/5" : undefined}>
                <TableCell className="font-medium max-w-[160px]"><TruncatedCell value={a.accountName} /></TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground max-w-[140px]"><TruncatedCell value={a.platformAccountId} /></TableCell>
                <TableCell><PlatformBadge platform={a.platform} /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <AccountStatusBadge status={a.status} />
                    {a.banNotifyProvider && (
                      <span className="text-xs text-destructive font-medium">待清零</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono">${Number(a.currentBalance).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{a.lastReportedAt ? new Date(a.lastReportedAt).toLocaleDateString("zh-CN") : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("zh-CN")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>

      <BatchCreateAccountDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
