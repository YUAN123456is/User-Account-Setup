import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListAccounts, useCreateDailyStat, useListDailyStats, getListAccountsQueryKey, getListDailyStatsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, CheckCircle, Info } from "lucide-react";

interface Account {
  id: number;
  accountName: string;
  platform: string;
  currentBalance: string;
  theoreticalBalance?: string | null;
}

export default function DailyReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    accountId: "",
    date: today,
    spendAmount: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const queryClient = useQueryClient();
  const { data: accountsData } = useListAccounts({});
  const { data: todayStatsData } = useListDailyStats({ dateFrom: today, dateTo: today } as Record<string, string>);
  const accounts = Array.isArray(accountsData) ? (accountsData as Account[]) : [];
  const todayStats = Array.isArray(todayStatsData) ? todayStatsData : [];
  const reportedIds = useMemo(() => new Set((todayStats as Array<{ accountId: number }>).map((s) => s.accountId)), [todayStats]);
  const { toast } = useToast();

  const selectedAccount = accounts.find((a) => String(a.id) === form.accountId);
  const currentBal = parseFloat(selectedAccount?.theoreticalBalance ?? selectedAccount?.currentBalance ?? "0");
  const spend = parseFloat(form.spendAmount) || 0;
  const previewBalance = isNaN(currentBal) ? null : (currentBal - spend).toFixed(2);

  const create = useCreateDailyStat({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
        queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) });
        setSubmitted(true);
        toast({ title: "上报成功", description: "今日消耗数据已成功提交，余额已自动更新。" });
        setForm({ accountId: "", date: today, spendAmount: "" });
        setTimeout(() => setSubmitted(false), 3000);
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "提交失败，请重试";
        toast({ title: "上报失败", description: msg, variant: "destructive" });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountId || !form.spendAmount) {
      toast({ title: "请填写完整", description: "请选择账户并填写今日消耗金额。", variant: "destructive" });
      return;
    }
    const spendVal = parseFloat(form.spendAmount);
    if (isNaN(spendVal) || spendVal < 0) {
      toast({ title: "金额无效", description: "请输入有效的消耗金额（≥ 0）。", variant: "destructive" });
      return;
    }
    create.mutate({
      data: {
        accountId: Number(form.accountId),
        date: form.date,
        spendAmount: spendVal.toFixed(2),
      },
    });
  };

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-xl font-bold">每日上报</h1>
        <p className="text-sm text-muted-foreground mt-0.5">提交今日消耗数据，余额由系统自动计算</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            提交每日消耗
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">选择账户 <span className="text-destructive">*</span></Label>
              <Select value={form.accountId} onValueChange={(v) => setForm({ ...form, accountId: v })}>
                <SelectTrigger><SelectValue placeholder="请选择账户..." /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.accountName}（{a.platform}）{reportedIds.has(a.id) ? " ✓已上报" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedAccount && (
              <div className="rounded-md bg-muted/40 border border-border px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">当前账户余额</span>
                  <span className="font-mono font-medium">${parseFloat(selectedAccount.theoreticalBalance ?? selectedAccount.currentBalance).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm">日期 <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                max={today}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">今日消耗（美元）<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.spendAmount}
                onChange={(e) => setForm({ ...form, spendAmount: e.target.value })}
              />
            </div>

            {selectedAccount && form.spendAmount && previewBalance !== null && (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm flex items-start gap-2">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground">提交后账户余额将更新为：</span>
                  <span className="font-mono font-semibold text-primary ml-1">${previewBalance}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">系统自动计算：当前余额 − 今日消耗</p>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={create.isPending}>
              {submitted ? (
                <span className="flex items-center gap-2"><CheckCircle className="h-4 w-4" /> 已提交</span>
              ) : create.isPending ? "提交中..." : "提交上报"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
