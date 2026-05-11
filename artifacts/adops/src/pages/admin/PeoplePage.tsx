import { useState } from "react";
import { cn } from "@/lib/utils";
import UsersPage from "@/pages/admin/UsersPage";
import TeamsPage from "@/pages/admin/TeamsPage";

type Tab = "users" | "teams";

const TABS: { id: Tab; label: string }[] = [
  { id: "users", label: "用户" },
  { id: "teams", label: "团队" },
];

export default function PeoplePage() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">人员管理</h1>
        <p className="text-sm text-muted-foreground mt-0.5">用户账号与投放团队配置</p>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              tab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersPage />}
      {tab === "teams" && <TeamsPage />}
    </div>
  );
}
