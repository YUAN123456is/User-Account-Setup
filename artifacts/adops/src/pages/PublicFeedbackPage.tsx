import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, ImageIcon, CheckCircle, Loader2, ClipboardList, ChevronDown, ChevronRight, Calendar, Hash, DollarSign, Image } from "lucide-react";

interface TeamInfo { teamId: number; teamName: string; }

interface Submission {
  id: number; date: string; leadCount: number; orderAmount?: string | null;
  description: string; images: string[]; submittedAt: string;
}

interface UploadedImage { objectPath: string; previewUrl: string; name: string; }

function getImageUrl(objectPath: string) {
  return `/api/storage/objects/${objectPath.replace(/^\/?(objects\/)/, "")}`;
}

async function requestUploadUrl(file: File): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!res.ok) throw new Error("获取上传链接失败");
  return res.json();
}

async function uploadToGCS(uploadURL: string, file: File): Promise<void> {
  const res = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!res.ok) throw new Error("上传失败");
}

function formatDate(d: string) {
  if (!d) return "-";
  const [y, m, dd] = d.split("-");
  return `${m}月${dd}日`;
}

function SubmissionRow({ sub, onOpen }: { sub: Submission; onOpen: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10 last:border-b-0">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-white/40">{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</span>
        <span className="flex items-center gap-1.5 text-sm font-medium text-white/90 w-24 shrink-0">
          <Calendar className="h-3.5 w-3.5 text-white/40" />
          {formatDate(sub.date)}
        </span>
        <span className="flex items-center gap-1 text-sm text-white/70">
          <Hash className="h-3 w-3 text-white/40" />{sub.leadCount} 线索
        </span>
        {sub.orderAmount && (
          <span className="flex items-center gap-1 text-sm text-emerald-400/80 ml-2">
            <DollarSign className="h-3 w-3" />¥{parseFloat(sub.orderAmount).toLocaleString("zh-CN")}
          </span>
        )}
        {sub.images.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-white/40">
            <Image className="h-3 w-3" />{sub.images.length}
          </span>
        )}
        <span className="text-xs text-white/30 ml-2 shrink-0">
          {new Date(sub.submittedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {sub.description && (
            <p className="text-sm text-white/60 pl-7">{sub.description}</p>
          )}
          {sub.images.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-7">
              {sub.images.map((p, i) => (
                <img key={i} src={getImageUrl(p)} alt="" onClick={() => onOpen(getImageUrl(p))}
                  className="h-20 w-auto rounded-md object-cover border border-white/10 cursor-pointer hover:opacity-80 transition-opacity" />
              ))}
            </div>
          )}
          {!sub.description && !sub.images.length && (
            <p className="text-xs text-white/30 pl-7">无备注和图片</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function PublicFeedbackPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { toast } = useToast();

  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [leadCount, setLeadCount] = useState("");
  const [orderAmount, setOrderAmount] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/public/team-feedback/${token}/submissions`);
      if (res.ok) setSubmissions(await res.json());
    } finally {
      setLoadingHistory(false);
    }
  }, [token]);

  useEffect(() => {
    fetch(`/api/public/team-feedback/${token}`)
      .then((r) => r.ok ? r.json() : r.json().then((e: { error: string }) => Promise.reject(e.error)))
      .then((info: TeamInfo) => { setTeamInfo(info); })
      .catch((e: unknown) => setLoadError(typeof e === "string" ? e : "链接无效或已过期"));
  }, [token]);

  useEffect(() => { if (teamInfo) fetchHistory(); }, [teamInfo, fetchHistory]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 10 - images.length);
    if (!validFiles.length) return;
    setUploading(true);
    try {
      for (const file of validFiles) {
        const previewUrl = URL.createObjectURL(file);
        const { uploadURL, objectPath } = await requestUploadUrl(file);
        await uploadToGCS(uploadURL, file);
        setImages((prev) => [...prev, { objectPath, previewUrl, name: file.name }]);
      }
    } catch {
      toast({ title: "图片上传失败，请重试", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [images.length, toast]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
      if (files.length) handleFiles(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [handleFiles]);

  const pickFiles = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.multiple = true;
    input.onchange = (e) => { const t = e.target as HTMLInputElement; if (t.files) handleFiles(t.files); };
    input.click();
  };

  const removeImage = (idx: number) => {
    setImages((prev) => { const next = [...prev]; URL.revokeObjectURL(next[idx].previewUrl); next.splice(idx, 1); return next; });
  };

  const handleSubmit = async () => {
    if (!leadCount || isNaN(parseInt(leadCount))) { toast({ title: "请填写有效的线索数量", variant: "destructive" }); return; }
    if (!date) { toast({ title: "请选择日期", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/team-feedback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, leadCount: parseInt(leadCount), orderAmount: orderAmount.trim() || null, description: description.trim(), images: images.map((i) => i.objectPath) }),
      });
      if (!res.ok) { const err = await res.json() as { error: string }; throw new Error(err.error); }
      setSubmitted(true);
      setLeadCount(""); setOrderAmount(""); setDescription(""); setImages([]);
      await fetchHistory();
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "提交失败，请重试"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto">
            <X className="h-5 w-5 text-red-400" />
          </div>
          <h2 className="text-white font-semibold">链接无效</h2>
          <p className="text-sm text-slate-400">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!teamInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-7 w-7 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-white/10 bg-white/5 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
              <ClipboardList className="h-4 w-4 text-white" />
            </div>
            <span className="text-white font-semibold text-sm">{teamInfo.teamName}</span>
          </div>
          <span className="text-xs text-slate-400 bg-slate-700/60 px-2.5 py-1 rounded-full">团队反馈</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Submit form */}
        {submitted ? (
          <div className="bg-white/8 border border-white/12 rounded-2xl p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle className="h-6 w-6 text-emerald-400" />
            </div>
            <p className="text-white font-medium">提交成功！</p>
            <p className="text-sm text-slate-400">数据已记录，感谢填报。</p>
            <Button variant="outline" size="sm" className="border-white/20 text-white/80 hover:bg-white/10 mt-1"
              onClick={() => setSubmitted(false)}>
              继续填报
            </Button>
          </div>
        ) : (
          <div className="bg-white/8 border border-white/12 rounded-2xl p-5 space-y-4">
            <h2 className="text-white font-semibold text-base">填写当日数据</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400 font-medium">日期 <span className="text-red-400">*</span></Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="bg-white/8 border-white/15 text-white h-9 text-sm focus-visible:ring-blue-500/40" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400 font-medium">线索数量 <span className="text-red-400">*</span></Label>
                <Input type="number" min="0" value={leadCount} onChange={(e) => setLeadCount(e.target.value)}
                  placeholder="0"
                  className="bg-white/8 border-white/15 text-white h-9 text-sm focus-visible:ring-blue-500/40 placeholder:text-slate-600" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400 font-medium">成单金额（可选）</Label>
              <Input type="text" value={orderAmount} onChange={(e) => setOrderAmount(e.target.value)}
                placeholder="0.00"
                className="bg-white/8 border-white/15 text-white h-9 text-sm focus-visible:ring-blue-500/40 placeholder:text-slate-600" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400 font-medium">备注说明</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="其他说明，如特殊情况、运营备注等..." rows={3}
                className="bg-white/8 border-white/15 text-white text-sm resize-none focus-visible:ring-blue-500/40 placeholder:text-slate-600" />
            </div>

            {/* Image drop zone */}
            <div className="space-y-2">
              <Label className="text-xs text-slate-400 font-medium">图片截图（最多10张）</Label>
              <div
                ref={dropRef}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); }}
                onClick={pickFiles}
                className={[
                  "rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-all",
                  dragging ? "border-blue-400 bg-blue-500/10" : "border-white/15 hover:border-white/30 hover:bg-white/5",
                ].join(" ")}
              >
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-blue-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">上传中...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-slate-500">
                    <Upload className="h-5 w-5" />
                    <p className="text-xs">拖拽、粘贴或点击上传图片</p>
                  </div>
                )}
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-5 gap-2">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-white/12">
                      <img src={img.previewUrl} alt={img.name} className="w-full h-full object-cover cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setLightbox(img.previewUrl); }} />
                      <button onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                  {images.length < 10 && (
                    <div onClick={pickFiles}
                      className="aspect-square rounded-lg border-2 border-dashed border-white/12 flex items-center justify-center text-slate-600 cursor-pointer hover:border-white/25 transition-colors">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white border-0 h-10" onClick={handleSubmit} disabled={submitting || uploading}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />提交中...</> : "提交反馈"}
            </Button>
          </div>
        )}

        {/* History table */}
        <div className="bg-white/8 border border-white/12 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/90">历史提交记录</h3>
            {loadingHistory && <Loader2 className="h-3.5 w-3.5 text-slate-500 animate-spin" />}
            {!loadingHistory && <span className="text-xs text-slate-500">{submissions.length} 条</span>}
          </div>

          {submissions.length === 0 && !loadingHistory ? (
            <div className="py-10 text-center text-slate-500 text-sm">暂无提交记录</div>
          ) : (
            <div className="divide-y divide-white/8">
              {submissions.map((sub) => (
                <SubmissionRow key={sub.id} sub={sub} onOpen={setLightbox} />
              ))}
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-xl object-contain shadow-2xl" />
          <button className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors" onClick={() => setLightbox(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
