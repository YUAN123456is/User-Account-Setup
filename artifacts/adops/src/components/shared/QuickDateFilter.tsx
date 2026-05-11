import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

type Preset = "yesterday" | "week" | "month" | "lastmonth" | "all" | "custom";

export interface DateRange { from: string; to: string; }

const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
const getWeekStart = () => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); };
const getMonthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const getLastMonthRange = () => {
  const d = new Date(); d.setDate(1);
  const end = new Date(d); end.setDate(0);
  d.setMonth(d.getMonth() - 1);
  return { from: d.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
};

const PRESETS: { value: Preset; label: string }[] = [
  { value: "yesterday", label: "昨天" },
  { value: "week", label: "近7天" },
  { value: "month", label: "本月" },
  { value: "lastmonth", label: "上月" },
  { value: "all", label: "全部" },
  { value: "custom", label: "自定义" },
];

function presetToRange(p: Preset): DateRange {
  if (p === "yesterday") return { from: yesterday, to: yesterday };
  if (p === "week") return { from: getWeekStart(), to: yesterday };
  if (p === "month") return { from: getMonthStart(), to: yesterday };
  if (p === "lastmonth") return getLastMonthRange();
  return { from: "", to: "" };
}

export function QuickDateFilter({
  onChange,
  defaultPreset = "all",
  hideAll = false,
}: {
  onChange: (range: DateRange) => void;
  defaultPreset?: Preset;
  hideAll?: boolean;
}) {
  const [preset, setPreset] = useState<Preset>(defaultPreset);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (preset !== "custom") {
      onChange(presetToRange(preset));
    } else {
      onChange({ from: customFrom, to: customTo });
    }
  }, [preset, customFrom, customTo]);

  const visiblePresets = hideAll ? PRESETS.filter((p) => p.value !== "all") : PRESETS;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center rounded-md border border-border overflow-hidden h-8">
        {visiblePresets.map((p, i) => (
          <button
            key={p.value}
            onClick={() => setPreset(p.value)}
            className={[
              "px-2.5 h-full text-xs font-medium transition-colors",
              i < visiblePresets.length - 1 ? "border-r border-border" : "",
              preset === p.value
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">至</span>
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
