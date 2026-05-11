import { useState } from "react";
import { cn } from "@/lib/utils";
import ProviderReportPage from "@/pages/admin/ProviderReportPage";
import PitcherReportPage from "@/pages/admin/PitcherReportPage";
import OpsReportPage from "@/pages/admin/OpsReportPage";
import CrossReportPage from "@/pages/admin/CrossReportPage";

type Tab = "provider" | "pitcher" | "ops" | "cross";

const TABS: { id: Tab; label: string }[] = [
  { id: "provider", label: "开户商" },
  { id: "pitcher", label: "投手" },
  { id: "ops", label: "运营" },
  { id: "cross", label: "交叉" },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("provider");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">报表</h1>
        <p className="text-sm text-muted-foreground mt-0.5">多维度消耗与运营数据</p>
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

      {tab === "provider" && <ProviderReportPage />}
      {tab === "pitcher" && <PitcherReportPage />}
      {tab === "ops" && <OpsReportPage />}
      {tab === "cross" && <CrossReportPage />}
    </div>
  );
}
