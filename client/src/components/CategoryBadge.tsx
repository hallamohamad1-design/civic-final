import { Badge } from "@/components/ui/badge";

interface CategoryBadgeProps {
  category: string;
}

const categoryColors: Record<string, string> = {
  Roads: "bg-slate-100 text-slate-800 hover:bg-slate-200",
  Water: "bg-cyan-100 text-cyan-800 hover:bg-cyan-200",
  Electricity: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
  Sanitation: "bg-orange-100 text-orange-800 hover:bg-orange-200",
  Other: "bg-gray-100 text-gray-800 hover:bg-gray-200",
};

export default function CategoryBadge({ category }: CategoryBadgeProps) {
  const className = categoryColors[category] || categoryColors.Other;

  return (
    <Badge variant="secondary" className={className}>
      {category}
    </Badge>
  );
}
