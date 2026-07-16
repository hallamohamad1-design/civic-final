import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: "open" | "in-progress" | "resolved";
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const statusConfig = {
    open: { label: "Open", className: "bg-blue-100 text-blue-800 hover:bg-blue-200" },
    "in-progress": { label: "In Progress", className: "bg-amber-100 text-amber-800 hover:bg-amber-200" },
    resolved: { label: "Resolved", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" },
  };

  const config = statusConfig[status];

  return (
    <Badge variant="secondary" className={config.className}>
      {config.label}
    </Badge>
  );
}
