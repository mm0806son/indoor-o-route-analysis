import { ArrowRight } from "lucide-react";

interface LegNameProps {
  from: string;
  to: string;
  className?: string;
  isSelected?: boolean;
}

export function LegName({ from, to, className, isSelected }: LegNameProps) {
  return (
    <div className={`flex items-center gap-0.5 whitespace-nowrap ${className || ""}`}>
      <span>{from}</span>
      <ArrowRight className={`h-3 w-3 stroke-[2px] ${isSelected ? "" : "text-muted-foreground"}`} />
      <span>{to}</span>
    </div>
  );
}
