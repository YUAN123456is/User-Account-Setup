import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Zap } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { setUser } = useAuth();
  const [, setLocation] = useLocation();

  const login = useLogin({
    mutation: {
      onSuccess: (data) => {
        const u = data.user;
        setUser(u);
        if (u.role === "admin") setLocation("/admin/dashboard");
        else if (u.role === "provider") setLocation("/provider/accounts");
        else setLocation("/pitcher/accounts");
      },
      onError: () => {
        setError("用户名或密码错误，请重试。");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError("请输入用户名和密码。");
      return;
    }
    login.mutate({ data: { username, password } });
  };

  return (
    <div className="min-h-screen flex bg-[hsl(222,50%,8%)]">
      <div className="hidden lg:flex flex-1 flex-col justify-center px-16 bg-gradient-to-br from-[hsl(222,50%,8%)] to-[hsl(222,47%,11%)] border-r border-white/5">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-primary rounded-lg p-2">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <span className="text-white text-2xl font-bold tracking-tight">AdOps</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            广告账户<br />统一管理中心
          </h1>
          <p className="text-[hsl(215,20%,55%)] text-lg leading-relaxed">
            为超级管理员、开户商和投手提供一站式管理平台。集中管理账户、追踪消耗、处理充值订单。
          </p>
          <div className="mt-12 grid grid-cols-3 gap-6">
            {[
              { label: "账户管理", value: "多平台支持" },
              { label: "余额预警", value: "实时监控" },
              { label: "消耗报表", value: "每日数据" },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/5 rounded-lg p-4 border border-white/5">
                <div className="text-[hsl(215,20%,55%)] text-xs mb-1">{stat.label}</div>
                <div className="text-white font-semibold">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="bg-primary rounded-lg p-1.5">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-white text-xl font-bold">AdOps</span>
          </div>
          <h2 className="text-white text-2xl font-bold mb-1">登录</h2>
          <p className="text-[hsl(215,20%,50%)] text-sm mb-8">请输入您的账号和密码以进入系统。</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-[hsl(215,20%,75%)] text-sm">用户名</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder=""
                className="bg-[hsl(222,40%,14%)] border-[hsl(222,40%,22%)] text-white placeholder:text-[hsl(215,20%,35%)] focus:border-primary h-10"
                data-testid="input-username"
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[hsl(215,20%,75%)] text-sm">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="bg-[hsl(222,40%,14%)] border-[hsl(222,40%,22%)] text-white placeholder:text-[hsl(215,20%,35%)] focus:border-primary h-10"
                data-testid="input-password"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-10 bg-primary hover:bg-primary/90 text-white font-medium"
              disabled={login.isPending}
              data-testid="btn-login"
            >
              {login.isPending ? "登录中..." : "登录"}
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
