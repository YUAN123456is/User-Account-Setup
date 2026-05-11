import { useState } from "react";
import { useListPitcherTeamFeedback, useListTeams } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { MessageSquare, X, ChevronDown, ChevronRight } from "lucide-react";

interface PitcherFeedback {
  id: number; teamId: number; teamName?: string | null;
  date: string; description: string; images: string[];
  submittedAt: string;
}

interface Team { id: number; name: string; }

function getImageUrl(objectPath: string) {
  return `/api/storage/objects/${objectPath.replace(/^\/?(objects\/)/, "")}`;
}

function ImageThumbnails({ images, onOpen }: { images: string[]; onOpen: (url: string) => void }) {
  if (!images.length) return <span className="text-muted-foreground text-xs">无</span>;
  return (
    <div className="flex gap-1 flex-wrap">
      {images.slice(0, 5).map((p, i) => (
        <img key={i} src={getImageUrl(p)} alt="" className="w-8 h-8 rounded object-cover border border-border cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => onOpen(getImageUrl(p))} />
      ))}
      {images.length > 5 && <span className="text-xs text-muted-foreground self-center">+{images.length - 5}</span>}
    </div>
  );
}

export default function TeamFeedbackPage() {
  const [teamId, setTeamId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: teamsData } = useListTeams({});
  const allTeams = Array.isArray(teamsData) ? (teamsData as Team[]) : [];

  const { data, isLoading } = useListPitcherTeamFeedback(
    {
      teamId: teamId ? parseInt(teamId) : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    },
  );
  const rows = Array.isArray(data) ? (data as PitcherFeedback[]) : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">团队反馈</h1>
        <p className="text-sm text-muted-foreground mt-0.5">查看各团队每日运营反馈数据</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}
          className="h-8 px-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="">全部团队</option>
          {allTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="h-8 text-sm w-36" placeholder="开始日期" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="h-8 text-sm w-36" placeholder="结束日期" />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-6"></TableHead>
              <TableHead>日期</TableHead>
              <TableHead>团队</TableHead>
              <TableHead>图片</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>提交时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6}>
                <EmptyState icon={MessageSquare} title="暂无反馈记录" description="暂时没有团队提交反馈数据。" />
              </TableCell></TableRow>
            )}
            {!isLoading && rows.map((row) => (
              <>
                <TableRow key={row.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                  <TableCell className="text-muted-foreground">
                    {expanded === row.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{row.date}</TableCell>
                  <TableCell className="text-sm">{row.teamName ?? "-"}</TableCell>
                  <TableCell>
                    <ImageThumbnails images={row.images} onOpen={setLightbox} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{row.description || "-"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(row.submittedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                </TableRow>
                {expanded === row.id && (
                  <TableRow key={`${row.id}-exp`}>
                    <TableCell colSpan={6} className="bg-muted/20 py-3 px-4">
                      <div className="space-y-3">
                        {row.description && <p className="text-sm text-foreground">{row.description}</p>}
                        {row.images.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {row.images.map((p, i) => (
                              <img key={i} src={getImageUrl(p)} alt="" className="h-24 w-auto rounded border border-border object-cover cursor-pointer hover:opacity-80"
                                onClick={() => setLightbox(getImageUrl(p))} />
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="预览" className="max-w-full max-h-full rounded-lg object-contain" />
          <button className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white" onClick={() => setLightbox(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
