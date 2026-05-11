import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, ImageIcon, CheckCircle, Loader2 } from "lucide-react";

interface TeamInfo { teamId: number; teamName: string; }
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
  const res = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("上传失败");
}

export default function PublicFeedbackPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { toast } = useToast();

  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [leadCount, setLeadCount] = useState("");
  const [orderAmount, setOrderAmount] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    fetch(`/api/public/team-feedback/${token}`)
      .then((r) => r.ok ? r.json() : r.json().then((e: { error: string }) => Promise.reject(e.error)))
      .then(setTeamInfo)
      .catch((e: unknown) => setLoadError(typeof e === "string" ? e : "链接无效或已过期"));
  }, [token]);

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
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
      if (files.length) handleFiles(files);
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handleFiles]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  const removeImage = (idx: number) => {
    setImages((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[idx].previewUrl);
      next.splice(idx, 1);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!leadCount || isNaN(parseInt(leadCount))) {
      toast({ title: "请填写有效的线索数量", variant: "destructive" }); return;
    }
    if (!date) { toast({ title: "请选择日期", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const body = {
        date,
        leadCount: parseInt(leadCount),
        orderAmount: orderAmount.trim() || null,
        description: description.trim(),
        images: images.map((i) => i.objectPath),
      };
      const res = await fetch(`/api/public/team-feedback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error);
      }
      setSubmitted(true);
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "提交失败，请重试"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-[hsl(222,50%,8%)] flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <X className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-white font-semibold">链接无效</h2>
          <p className="text-sm text-[hsl(215,20%,50%)]">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!teamInfo) {
    return (
      <div className="min-h-screen bg-[hsl(222,50%,8%)] flex items-center justify-center">
        <Loader2 className="h-7 w-7 text-primary animate-spin" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[hsl(222,50%,8%)] flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-green-400" />
          </div>
          <h2 className="text-white text-lg font-semibold">提交成功！</h2>
          <p className="text-sm text-[hsl(215,20%,50%)]">感谢 <span className="text-white font-medium">{teamInfo.teamName}</span> 团队的反馈数据。</p>
          <Button variant="outline" className="mt-2" onClick={() => { setSubmitted(false); setLeadCount(""); setOrderAmount(""); setDescription(""); setImages([]); }}>
            继续提交
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(222,50%,8%)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-4">
            <span className="text-xs text-primary font-medium">团队反馈</span>
          </div>
          <h1 className="text-xl font-bold text-white">{teamInfo.teamName}</h1>
          <p className="text-sm text-[hsl(215,20%,50%)] mt-1">请填写当日运营数据</p>
        </div>

        <div className="bg-[hsl(222,45%,11%)] rounded-xl border border-[hsl(220,20%,18%)] p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm text-[hsl(215,20%,70%)]">日期 <span className="text-destructive">*</span></Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="bg-[hsl(222,50%,8%)] border-[hsl(220,20%,18%)] text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-[hsl(215,20%,70%)]">线索数量 <span className="text-destructive">*</span></Label>
              <Input type="number" min="0" value={leadCount} onChange={(e) => setLeadCount(e.target.value)}
                placeholder="0" className="bg-[hsl(222,50%,8%)] border-[hsl(220,20%,18%)] text-white" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-[hsl(215,20%,70%)]">成单金额（可选）</Label>
            <Input type="text" value={orderAmount} onChange={(e) => setOrderAmount(e.target.value)}
              placeholder="0.00" className="bg-[hsl(222,50%,8%)] border-[hsl(220,20%,18%)] text-white" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-[hsl(215,20%,70%)]">备注说明</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="其他说明，如特殊情况或运营备注..." rows={3}
              className="bg-[hsl(222,50%,8%)] border-[hsl(220,20%,18%)] text-white resize-none" />
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-[hsl(215,20%,70%)]">图片截图（最多10张）</Label>
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={["relative rounded-lg border-2 border-dashed transition-colors p-4 text-center cursor-pointer",
                dragging ? "border-primary bg-primary/5" : "border-[hsl(220,20%,22%)] hover:border-primary/50"].join(" ")}
              onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.multiple = true; input.onchange = (e) => { const t = e.target as HTMLInputElement; if (t.files) handleFiles(t.files); }; input.click(); }}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">上传中...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-[hsl(215,20%,50%)]">
                  <Upload className="h-5 w-5" />
                  <p className="text-xs">拖拽、粘贴或点击上传图片</p>
                </div>
              )}
            </div>

            {images.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mt-2">
                {images.map((img, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-md overflow-hidden border border-[hsl(220,20%,18%)]">
                    <img src={img.previewUrl} alt={img.name} className="w-full h-full object-cover cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setLightbox(img.previewUrl); }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {images.length < 10 && (
                  <div className="aspect-square rounded-md border-2 border-dashed border-[hsl(220,20%,22%)] flex items-center justify-center text-[hsl(215,20%,40%)] cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.multiple = true; input.onchange = (e) => { const t = e.target as HTMLInputElement; if (t.files) handleFiles(t.files); }; input.click(); }}>
                    <ImageIcon className="h-4 w-4" />
                  </div>
                )}
              </div>
            )}
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={submitting || uploading}>
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />提交中...</> : "提交反馈"}
          </Button>
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="预览" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
          <button className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20" onClick={() => setLightbox(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
