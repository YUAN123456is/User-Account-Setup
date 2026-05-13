import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Clock, Plus, Ticket, ChevronDown, ChevronUp, FileText, RefreshCw, X } from "lucide-react";

const PROVIDERS = ["开户商 - 小王", "开户商 - 晓敏", "开户商 - 张总"];

const TICKET_TYPES = [
  { value: "new_account", label: "开新户" },
  { value: "rebind_bm", label: "换绑 BM" },
];

const PLATFORMS = ["FB", "GG", "TT", "TW"];

const MOCK_TICKETS = [
  { id: 1, type: "new_account", typeLabel: "开新户", provider: "开户商 - 小王", status: "completed", createdAt: "2026-05-10", platform: "FB", budget: "$500", note: "已完成，账户 ID：act_12345678", completedAt: "2026-05-11" },
  { id: 2, type: "rebind_bm", typeLabel: "换绑 BM", provider: "开户商 - 晓敏", status: "pending", createdAt: "2026-05-12", currentBm: "BM_001", newBm: "BM_002", note: "", completedAt: null },
  { id: 3, type: "new_account", typeLabel: "开新户", provider: "开户商 - 张总", status: "pending", createdAt: "2026-05-13", platform: "GG", budget: "$1000", note: "", completedAt: null },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 text-xs font-medium"><CheckCircle2 className="h-3 w-3" />已完成</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1 text-xs font-medium"><Clock className="h-3 w-3" />待处理</Badge>;
}

function NewAccountFields({ data, onChange }: { data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label className="text-sm">广告平台 <span className="text-red-400">*</span></Label>
        <Select value={data.platform} onValueChange={(v) => onChange("platform", v)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="选择平台..." /></SelectTrigger>
          <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm">开户预算（美元）<span className="text-red-400">*</span></Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <Input className="pl-6 h-9" placeholder="0.00" value={data.budget} onChange={(e) => onChange("budget", e.target.value)} />
        </div>
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label className="text-sm">开户主体 / 公司名</Label>
        <Input className="h-9" placeholder="例：ABC Trading Ltd." value={data.company} onChange={(e) => onChange("company", e.target.value)} />
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label className="text-sm">备注 / 补充说明</Label>
        <Textarea rows={3} placeholder="其他需要说明的要求..." value={data.remark} onChange={(e) => onChange("remark", e.target.value)} />
      </div>
    </div>
  );
}

function RebindBmFields({ data, onChange }: { data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label className="text-sm">广告账户 ID <span className="text-red-400">*</span></Label>
        <Input className="h-9 font-mono" placeholder="act_xxxxxxxx" value={data.accountId} onChange={(e) => onChange("accountId", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm">当前 BM ID <span className="text-red-400">*</span></Label>
        <Input className="h-9 font-mono" placeholder="当前绑定的 BM" value={data.currentBm} onChange={(e) => onChange("currentBm", e.target.value)} />
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label className="text-sm">目标 BM ID <span className="text-red-400">*</span></Label>
        <Input className="h-9 font-mono" placeholder="要换绑的新 BM ID" value={data.newBm} onChange={(e) => onChange("newBm", e.target.value)} />
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label className="text-sm">备注 / 补充说明</Label>
        <Textarea rows={3} placeholder="其他需要说明的信息..." value={data.remark} onChange={(e) => onChange("remark", e.target.value)} />
      </div>
    </div>
  );
}

export function PitcherTickets() {
  const [tab, setTab] = useState("new");
  const [provider, setProvider] = useState("");
  const [ticketType, setTicketType] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({ platform: "", budget: "", company: "", accountId: "", currentBm: "", newBm: "", remark: "" });
  const [submitted, setSubmitted] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleField = (k: string, v: string) => setFields(prev => ({ ...prev, [k]: v }));

  const handleSubmit = () => {
    if (!provider || !ticketType) return;
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setTab("history");
      setProvider(""); setTicketType("");
      setFields({ platform: "", budget: "", company: "", accountId: "", currentBm: "", newBm: "", remark: "" });
    }, 1800);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar mock header */}
      <div className="flex h-screen">
        {/* Sidebar stub */}
        <div className="w-52 border-r border-border bg-card flex flex-col py-4 px-3 gap-1 shrink-0">
          <div className="text-xs font-semibold text-muted-foreground px-2 mb-2">投手工作台</div>
          {["工作台", "我的账户", "每日上报", "申请充值", "团队反馈", "FB 账号配置"].map(item => (
            <div key={item} className="text-sm px-2 py-1.5 rounded-md text-muted-foreground hover:bg-muted cursor-pointer">{item}</div>
          ))}
          <div className="text-sm px-2 py-1.5 rounded-md bg-primary/10 text-primary font-medium flex items-center gap-2 cursor-pointer">
            <Ticket className="h-3.5 w-3.5" />提交工单
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-3xl">
            <div className="mb-5">
              <h1 className="text-xl font-bold flex items-center gap-2"><Ticket className="h-5 w-5 text-primary" />工单管理</h1>
              <p className="text-sm text-muted-foreground mt-0.5">向开户商提交开新户或换绑 BM 请求</p>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-5">
                <TabsTrigger value="new" className="gap-1.5"><Plus className="h-3.5 w-3.5" />提交新工单</TabsTrigger>
                <TabsTrigger value="history" className="gap-1.5"><FileText className="h-3.5 w-3.5" />我的工单记录</TabsTrigger>
              </TabsList>

              <TabsContent value="new">
                <div className="rounded-lg border border-border bg-card p-5 space-y-5">
                  {/* Step 1 */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">① 选择目标开户商</p>
                    <Select value={provider} onValueChange={setProvider}>
                      <SelectTrigger className="max-w-xs h-9">
                        <SelectValue placeholder="选择开户商..." />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Step 2 */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">② 选择工单类型</p>
                    <div className="flex gap-3">
                      {TICKET_TYPES.map(t => (
                        <button
                          key={t.value}
                          onClick={() => setTicketType(t.value)}
                          className={[
                            "flex-1 max-w-[180px] rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all",
                            ticketType === t.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:border-muted-foreground/40"
                          ].join(" ")}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Step 3: Fields */}
                  {ticketType && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">③ 填写工单资料</p>
                      {ticketType === "new_account"
                        ? <NewAccountFields data={fields} onChange={handleField} />
                        : <RebindBmFields data={fields} onChange={handleField} />
                      }
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-1 border-t border-border">
                    <Button
                      onClick={handleSubmit}
                      disabled={!provider || !ticketType || submitted}
                      className="gap-1.5"
                    >
                      {submitted
                        ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />提交中...</>
                        : <><Ticket className="h-3.5 w-3.5" />提交工单</>
                      }
                    </Button>
                    {submitted && <span className="text-sm text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />已发送给开户商</span>}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="history">
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>工单类型</TableHead>
                        <TableHead>开户商</TableHead>
                        <TableHead>提交时间</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="w-16">详情</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MOCK_TICKETS.map(t => (
                        <>
                          <TableRow key={t.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                            <TableCell className="font-medium">{t.typeLabel}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{t.provider}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{t.createdAt}</TableCell>
                            <TableCell><StatusBadge status={t.status} /></TableCell>
                            <TableCell>
                              <button className="text-muted-foreground hover:text-foreground">
                                {expandedId === t.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            </TableCell>
                          </TableRow>
                          {expandedId === t.id && (
                            <TableRow key={`${t.id}-detail`} className="bg-muted/20">
                              <TableCell colSpan={5} className="py-3 px-4">
                                <div className="text-xs space-y-1.5 text-muted-foreground">
                                  {t.type === "new_account" && <>
                                    <p>平台：<span className="text-foreground font-medium">{t.platform}</span></p>
                                    <p>预算：<span className="text-foreground font-mono">{t.budget}</span></p>
                                  </>}
                                  {t.type === "rebind_bm" && <>
                                    <p>原 BM：<span className="text-foreground font-mono">{t.currentBm}</span></p>
                                    <p>目标 BM：<span className="text-foreground font-mono">{t.newBm}</span></p>
                                  </>}
                                  {t.note && <p className="text-emerald-400 mt-1">开户商回复：{t.note}</p>}
                                  {t.completedAt && <p>完成时间：{t.completedAt}</p>}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
