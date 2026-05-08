import { useState } from "react";
import { useListAccounts, useCreateDailyStat } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, CheckCircle } from "lucide-react";

interface Account { id: number; accountName: string; platform: string; }

export default function DailyReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    accountId: "",
    date: today,
    spendAmount: "",
    realBalance: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const { data: accountsData } = useListAccounts({});
  const accounts = Array.isArray(accountsData) ? (accountsData as Account[]) : [];
  const { toast } = useToast();

  const create = useCreateDailyStat({
    mutation: {
      onSuccess: () => {
        setSubmitted(true);
        toast({ title: "上报成功", description: "今日消耗数据已成功提交。" });
        setForm({ accountId: "", date: today, spendAmount: "", realBalance: "" });
        setTimeout(() => setSubmitted(false), 3000);
      },
      onError: () => {
        toast({ title: "上报失败", description: "请检查输入数据后重试。", variant: "destructive" });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountId || !form.spendAmount || !form.realBalance) {
      toast({ title: "请填写完整", description: "所有必填项均需填写。", variant: "destructive" });
      return;
    }
    create.mutate({
      data: {
        accountId: Number(form.accountId),
        date: form.date,
        spendAmount: form.spendAmount,
        realBalance: form.realBalance,
      },
    });
  };

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-xl font-bold">每日上报</h1>
        <p className="text-sm text-muted-foreground mt-0.5">提交今日消耗及账户余额数据</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            提交每日数据
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
                      {a.accountName}（{a.platform}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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

            <div className="space-y-1.5">
              <Label className="text-sm">当前实际余额（美元）<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.realBalance}
                onChange={(e) => setForm({ ...form, realBalance: e.target.value })}
              />
            </div>

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
