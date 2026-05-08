import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

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

function DateInput({ value, onChange, placeholder, min }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  min?: string;
}) {
  const hiddenRef = useRef<HTMLInputElement>(null);

  const handleTextChange = (raw: string) => {
    const cleaned = raw.replace(/[^\d-]/g, "");
    onChange(cleaned);
  };

  const isValid = /^\d{4}-\d{2}-\d{2}$/.test(value);

  return (
    <div className="relative">
      <Input
        type="text"
        value={value}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder={placeholder}
        maxLength={10}
        className="h-8 text-xs w-36 pr-8 font-mono"
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => hiddenRef.current?.showPicker?.()}
        tabIndex={-1}
      >
        <CalendarIcon className="h-3.5 w-3.5" />
      </button>
      <input
        ref={hiddenRef}
        type="date"
        value={isValid ? value : ""}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 pointer-events-none w-full"
        tabIndex={-1}
      />
    </div>
  );
}

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
            variant="outline"
            size="sm"
            className={cn(
              "h-8 text-xs px-2.5 border-border text-muted-foreground hover:text-foreground transition-colors",
              isPresetActive(p) && "bg-primary/15 text-primary border-primary/40 hover:text-primary"
            )}
            onClick={() => onChange(isPresetActive(p) ? { from: "", to: "" } : p.get())}
          >
            {p.label}
          </Button>
        ))}
        {(value.from || value.to) && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs px-2 text-muted-foreground hover:text-foreground border-border"
            onClick={clear}
          >
            清除
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <DateInput
          value={value.from}
          onChange={(v) => onChange({ ...value, from: v })}
          placeholder="YYYY-MM-DD"
        />
        <span className="text-muted-foreground text-xs">至</span>
        <DateInput
          value={value.to}
          onChange={(v) => onChange({ ...value, to: v })}
          placeholder="YYYY-MM-DD"
          min={value.from || undefined}
        />
      </div>
    </div>
  );
}
