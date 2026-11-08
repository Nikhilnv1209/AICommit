"use client";

import {
  AUDIT_ACTION_GROUPS,
  AUDIT_ACTION_LABELS,
  type AuditRange,
} from "@/lib/audit-actions";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const RANGES: Array<{ value: AuditRange; label: string }> = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

interface AuditFiltersProps {
  action: string;
  status: string;
  range: AuditRange;
  isRefreshing: boolean;
  onActionChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRangeChange: (value: AuditRange) => void;
  onRefresh: () => void;
}

const AuditFilters = ({
  action,
  status,
  range,
  isRefreshing,
  onActionChange,
  onStatusChange,
  onRangeChange,
  onRefresh,
}: AuditFiltersProps) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={action} onValueChange={onActionChange}>
        <SelectTrigger className="h-8 w-[170px] font-mono text-xs">
          <SelectValue placeholder="All actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="font-mono text-xs">
            All actions
          </SelectItem>
          {AUDIT_ACTION_GROUPS.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel className="font-mono text-[10px] uppercase tracking-wider">
                {group.label}
              </SelectLabel>
              {group.actions.map((action_) => (
                <SelectItem key={action_} value={action_} className="font-mono text-xs">
                  {AUDIT_ACTION_LABELS[action_]}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="h-8 w-[120px] font-mono text-xs">
          <SelectValue placeholder="Any status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="font-mono text-xs">
            Any status
          </SelectItem>
          <SelectItem value="success" className="font-mono text-xs">
            Success
          </SelectItem>
          <SelectItem value="failure" className="font-mono text-xs">
            Failed
          </SelectItem>
        </SelectContent>
      </Select>

      <Select value={range} onValueChange={(value) => onRangeChange(value as AuditRange)}>
        <SelectTrigger className="h-8 w-[120px] font-mono text-xs">
          <SelectValue placeholder="Last 7 days" />
        </SelectTrigger>
        <SelectContent>
          {RANGES.map((option) => (
            <SelectItem key={option.value} value={option.value} className="font-mono text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        className="h-8 font-mono text-xs text-muted-foreground"
      >
        <RefreshCw className={cn("mr-1.5 size-3.5", isRefreshing && "animate-spin")} />
        refresh
      </Button>
    </div>
  );
};

export default AuditFilters;
