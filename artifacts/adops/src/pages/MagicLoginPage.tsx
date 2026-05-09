import { useEffect, useState } from "react";
import { useParams, Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, AlertTriangle } from "lucide-react";

export default function MagicLoginPage() {
  const { token } = useParams<{ token: string }>();
  const { setUser, user } = useAuth();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError("链接无效"); return; }
    fetch(`/api/auth/magic/${token}`, { credentials: "include" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) { setError(body.error ?? "链接无效或已过期"); return; }
        setUser(body);
        setDone(true);
      })
      .catch(() => setError("网络错误，请稍后重试"));
  }, [token, setUser]);

  if (done || user) return <Redirect to="/provider/accounts" />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      {error ? (
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="text-lg font-semibold">链接无效</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">正在验证链接，请稍候…</p>
        </div>
      )}
    </div>
  );
}
