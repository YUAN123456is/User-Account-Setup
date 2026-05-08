import { cn } from "@/lib/utils";

export interface StatItem {
  label: string;
  value: string | number;
  color?: "default" | "green" | "amber" | "red" | "blue" | "purple";
}

interface StatsBarProps {
  items: StatItem[];
  className?: string;
}

const colorMap: Record<NonNullable<StatItem["color"]>, string> = {
  default: "text-foreground",
  green: "text-green-500",
  amber: "text-amber-500",
  red: "text-red-500",
  blue: "text-blue-500",
  purple: "text-purple-500",
};

export function StatsBar({ items, className }: StatsBarProps) {
  return (
    <div className={cn("flex flex-wrap gap-px rounded-lg border border-border overflow-hidden", className)}>
      {items.map((item, i) => (
        <div key={i} className="flex-1 min-w-[100px] bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1 truncate">{item.label}</p>
          <p className={cn("text-lg font-bold tabular-nums", colorMap[item.color ?? "default"])}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
