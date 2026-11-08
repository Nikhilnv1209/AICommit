"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getAuditLogs } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuditRange, AuditStatus } from "@/lib/audit-actions";
import { ScrollText } from "lucide-react";
import AuditFilters from "./filters";
import AuditTable from "./audit-table";

type Scope = "project" | "personal";

const TableSkeleton = () => (
  <div className="space-y-4">
    {Array.from({ length: 5 }).map((_, index) => (
      <div key={index} className="flex items-start gap-3 rounded-lg border border-border p-3">
        <Skeleton className="size-6 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-14 text-center">
    <ScrollText className="mb-3 size-6 text-muted-foreground" />
    <p className="font-mono text-sm">{title}</p>
    {hint && <p className="mt-1 max-w-sm font-mono text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

const AuditPage = () => {
  const { projectId, project } = useProject();
  const [scope, setScope] = useState<Scope>("project");
  const [action, setAction] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState<AuditRange>("7d");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["audit-logs", scope, projectId, action, status, range],
    queryFn: ({ pageParam }) =>
      getAuditLogs({
        scope,
        projectId: projectId ?? undefined,
        cursor: pageParam,
        action: action === "all" ? undefined : action,
        status: status === "all" ? undefined : (status as AuditStatus),
        range,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: scope === "personal" || Boolean(projectId),
    staleTime: 15_000,
  });

  const events = useMemo(
    () => query.data?.pages.flatMap((page) => page.events) ?? [],
    [query.data]
  );
  const error = query.data?.pages.find((page) => !page.success)?.error;

  const subtitle =
    scope === "project"
      ? project
        ? `// activity in ${project.name}`
        : "// select a project to see its activity"
      : "// your activity across projects";

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-medium tracking-tight">audit</h1>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <Tabs value={scope} onValueChange={(value) => setScope(value as Scope)} className="mt-4">
        <TabsList>
          <TabsTrigger value="project" className="font-mono text-xs">
            project
          </TabsTrigger>
          <TabsTrigger value="personal" className="font-mono text-xs">
            my activity
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4">
        <AuditFilters
          action={action}
          status={status}
          range={range}
          isRefreshing={query.isFetching && !query.isLoading}
          onActionChange={(value) => {
            setAction(value);
            setExpandedId(null);
          }}
          onStatusChange={(value) => {
            setStatus(value);
            setExpandedId(null);
          }}
          onRangeChange={(value) => {
            setRange(value);
            setExpandedId(null);
          }}
          onRefresh={() => query.refetch()}
        />
      </div>

      <div className="mt-5">
        {scope === "project" && !projectId ? (
          <EmptyState
            title="No project selected"
            hint="Pick a project in the sidebar to see the activity of its members."
          />
        ) : query.isLoading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <p className="font-mono text-xs text-red-500">{error}</p>
            <Button variant="outline" size="sm" className="mt-3 font-mono text-xs" onClick={() => query.refetch()}>
              try again
            </Button>
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            title="No activity in this window"
            hint="Try a wider date range or a different filter."
          />
        ) : (
          <AuditTable
            events={events}
            expandedId={expandedId}
            showProject={scope === "personal"}
            onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
          />
        )}
      </div>

      {query.hasNextPage && (
        <div className="mt-5 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "loading…" : "load more"}
          </Button>
        </div>
      )}

      <p className="mt-6 font-mono text-[10px] text-muted-foreground">
        Logs older than 90 days are archived to cold storage.
      </p>
    </div>
  );
};

export default AuditPage;
