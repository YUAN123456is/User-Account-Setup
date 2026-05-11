import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TruncatedCellProps {
  value: string;
  className?: string;
  maxWidth?: string;
}

export function TruncatedCell({ value, className, maxWidth }: TruncatedCellProps) {
  const { toast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    toast({ title: "已复制", description: value.length > 50 ? value.slice(0, 50) + "…" : value });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("block truncate cursor-default select-text", maxWidth, className)}
          onDoubleClick={copy}
        >
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs break-all">
        <p className="text-xs">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">双击可复制</p>
      </TooltipContent>
    </Tooltip>
  );
}
