import React from "react";

interface RouteLabelsProps {
  labels: string[];
  className?: string;
  emptyLabel?: string;
}

export function RouteLabels({ labels, className, emptyLabel = "Shortest" }: RouteLabelsProps) {
  if (!labels || labels.length === 0) {
    return <span className={`italic opacity-70 ${className}`}>{emptyLabel}</span>;
  }

  // Concatenate labels without separators
  const text = labels.join("");
  
  return (
    <span className={`font-mono text-xs tracking-tight ${className}`} title={labels.join(", ")}>
      {text}
    </span>
  );
}
