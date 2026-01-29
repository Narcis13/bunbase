/**
 * Collection card component for dashboard.
 * Displays collection statistics in a clickable card.
 */

import { Database, FileText, Clock, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

interface CollectionCardProps {
  name: string;
  type?: "base" | "auth";
  recordCount: number;
  fieldCount: number;
  updatedAt: string;
  onClick: () => void;
}

/**
 * CollectionCard displays a single collection's statistics.
 * Shows name, field count, record count, and last updated time.
 */
export function CollectionCard({
  name,
  type,
  recordCount,
  fieldCount,
  updatedAt,
  onClick,
}: CollectionCardProps) {
  const Icon = type === "auth" ? Users : Database;
  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {name}
        </CardTitle>
        <CardDescription>
          {fieldCount} field{fieldCount !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span>
              {recordCount} record{recordCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
