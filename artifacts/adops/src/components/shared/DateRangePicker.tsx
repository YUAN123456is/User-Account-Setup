import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

const today = () => toDateStr(new Date());

const presets: { label: string; get: () => DateRange }[] = [
  {
    label: "今天",
    get: () => { const t = today(); return { from: t, to: t }; },
  },
  {
    label: "本周",
    get: () => {
      const d = new Date();
      const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const mon = new Date(d); mon.setDate(d.getDate() - day);
      return { from: toDateStr(mon), to: today() };
    },
  },
  {
    label: "本月",
    get: () => {
      const d = new Date();
      return { from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, to: today() };
    },
  },
  {
    label: "上月",
    get: () => {
      const d = new Date();
      d.setDate(1); d.setMonth(d.getMonth() - 1);
      const y = d.getFullYear(), m = d.getMonth() + 1;
      const last = new Date(y, m, 0);
      return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: toDateStr(last) };
    },
  },
];

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const isPresetActive = (preset: (typeof presets)[number]) => {
    const p = preset.get();
    return value.from === p.from && value.to === p.to;
  };

  const clear = () => onChange({ from: "", to: "" });

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex gap-1">
        {presets.map((p) => (
          <Button
            key={p.label}
            variant={isPresetActive(p) ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "h-8 text-xs px-2.5",
              isPresetActive(p) && "bg-primary/15 text-primary border border-primary/25"
            )}
            onClick={() => onChange(isPresetActive(p) ? { from: "", to: "" } : p.get())}
          >
            {p.label}
          </Button>
        ))}
        {(value.from || value.to) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs px-2 text-muted-foreground hover:text-foreground" onClick={clear}>
            清除
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="h-8 text-xs w-36 [color-scheme:dark]"
          placeholder="开始日期"
        />
        <span className="text-muted-foreground text-xs">至</span>
        <Input
          type="date"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className="h-8 text-xs w-36 [color-scheme:dark]"
          placeholder="结束日期"
          min={value.from || undefined}
        />
      </div>
    </div>
  );
}
