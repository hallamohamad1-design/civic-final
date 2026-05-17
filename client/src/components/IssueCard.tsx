import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ThumbsUp } from "lucide-react";
import StatusBadge from "./StatusBadge";
import CategoryBadge from "./CategoryBadge";
import { Link } from "wouter";
import type { Issue } from "@shared/types";

interface IssueCardProps {
  issue: Issue;
  isSelected?: boolean;
  onClick?: () => void;
}

export default function IssueCard({ issue, isSelected, onClick }: IssueCardProps) {
  return (
    <Link href={`/issues/${issue.id}`}>
      <Card
        className={`cursor-pointer transition-all hover:shadow-md border-none ${
          isSelected ? "ring-2 ring-primary bg-primary/5" : "bg-slate-50"
        }`}
        onClick={onClick}
      >
        <CardContent className="p-4 flex gap-3">
          {issue.imageUrl && (
            <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-slate-200">
              <img src={issue.imageUrl} className="w-full h-full object-cover" alt={issue.title} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start mb-1">
              <h4 className="font-bold text-slate-900 line-clamp-1 text-sm">{issue.title}</h4>
              <StatusBadge status={issue.status} />
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500 mb-2">
              <MapPin className="h-3 w-3" />
              <span className="line-clamp-1">
                {issue.address?.includes("Location identified by") && issue.latitude && issue.longitude
                  ? `${Number(issue.latitude).toFixed(6)}, ${Number(issue.longitude).toFixed(6)}`
                  : issue.address}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <CategoryBadge category={issue.category} />
              <div className="flex items-center gap-1 text-[10px] text-slate-600">
                <ThumbsUp className="h-3 w-3" />
                <span>{issue.upvotes}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
