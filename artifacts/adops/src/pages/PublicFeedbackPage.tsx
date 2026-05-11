import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, ImageIcon, CheckCircle, Loader2, ClipboardList, ChevronDown, ChevronRight, Calendar } from "lucide-react";

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
  return `${y}年${m}月${dd}日`;
}

function SubmissionRow({ sub, onOpen }: { sub: Submission; onOpen: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-gray-400">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800 w-28 shrink-0">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          {formatDate(sub.date)}
        </span>
        <span className="text-sm text-gray-600">
          线索 <span className="font-semibold text-gray-800">{sub.leadCount}</span>
        </span>
        {sub.orderAmount && (
          <span className="text-sm text-emerald-600 ml-1">
            ¥<span className="font-semibold">{parseFloat(sub.orderAmount).toLocaleString("zh-CN")}</span>
          </span>
        )}
        {sub.images.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
            <ImageIcon className="h-3 w-3" />{sub.images.length} 张
          </span>
        )}
        <span className="text-xs text-gray-400 ml-2 shrink-0">
          {new Date(sub.submittedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-3 bg-gray-50/60">
          {sub.description && (
            <p className="text-sm text-gray-600 pl-7 pt-1">{sub.description}</p>
          )}
          {sub.images.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-7">
              {sub.images.map((p, i) => (
                <img key={i} src={getImageUrl(p)} alt="" onClick={() => onOpen(getImageUrl(p))}
                  className="h-20 w-auto rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity shadow-sm" />
              ))}
            </div>
          )}
          {!sub.description && !sub.images.length && (
            <p className="text-xs text-gray-400 pl-7 pt-1">无备注和图片</p>
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
      .then((info: TeamInfo) => setTeamInfo(info))
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <X className="h-5 w-5 text-red-500" />
          </div>
          <h2 className="text-gray-800 font-semibold">链接无效</h2>
          <p className="text-sm text-gray-500">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!teamInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-7 w-7 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <ClipboardList className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-gray-900 font-semibold">{teamInfo.teamName}</span>
          </div>
          <span className="text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full font-medium">团队反馈</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Submit form */}
        {submitted ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-3 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle className="h-7 w-7 text-emerald-500" />
            </div>
            <p className="text-gray-900 font-semibold text-lg">提交成功！</p>
            <p className="text-sm text-gray-500">数据已记录，感谢填报。</p>
            <Button variant="outline" size="sm" className="mt-2 border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={() => setSubmitted(false)}>
              继续填报
            </Button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <h2 className="text-gray-900 font-semibold text-base">填写当日数据</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-700 font-medium">日期 <span className="text-red-500">*</span></Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="border-gray-300 text-gray-900 h-10 text-sm focus-visible:ring-blue-500 bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-700 font-medium">线索数量 <span className="text-red-500">*</span></Label>
                <Input type="number" min="0" value={leadCount} onChange={(e) => setLeadCount(e.target.value)}
                  placeholder="0"
                  className="border-gray-300 text-gray-900 h-10 text-sm focus-visible:ring-blue-500 bg-white placeholder:text-gray-400" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700 font-medium">成单金额<span className="text-gray-400 font-normal ml-1">（可选）</span></Label>
              <Input type="text" value={orderAmount} onChange={(e) => setOrderAmount(e.target.value)}
                placeholder="0.00"
                className="border-gray-300 text-gray-900 h-10 text-sm focus-visible:ring-blue-500 bg-white placeholder:text-gray-400" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700 font-medium">备注说明</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="其他说明，如特殊情况、运营备注等..." rows={3}
                className="border-gray-300 text-gray-900 text-sm resize-none focus-visible:ring-blue-500 bg-white placeholder:text-gray-400" />
            </div>

            {/* Image drop zone */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-700 font-medium">图片截图<span className="text-gray-400 font-normal ml-1">（最多10张）</span></Label>
              <div
                ref={dropRef}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); }}
                onClick={pickFiles}
                className={[
                  "rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-all",
                  dragging ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50",
                ].join(" ")}
              >
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-blue-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">上传中...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-gray-400">
                    <Upload className="h-5 w-5" />
                    <p className="text-sm">拖拽、粘贴或点击上传图片</p>
                  </div>
                )}
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-5 gap-2">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 shadow-sm">
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
                      className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0 h-10 text-sm font-medium"
              onClick={handleSubmit} disabled={submitting || uploading}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />提交中...</> : "提交反馈"}
            </Button>
          </div>
        )}

        {/* History table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">历史提交记录</h3>
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              {loadingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `共 ${submissions.length} 条`}
            </span>
          </div>

          {submissions.length === 0 && !loadingHistory ? (
            <div className="py-12 text-center text-gray-400 text-sm">暂无提交记录</div>
          ) : (
            <div>
              {submissions.map((sub) => (
                <SubmissionRow key={sub.id} sub={sub} onOpen={setLightbox} />
              ))}
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-xl object-contain shadow-2xl" />
          <button className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors" onClick={() => setLightbox(null)}>
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
