"use client";

import { getIndexingProgress } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

const IndexingProgress = () => {
  const { projectId } = useProject();

  const { data, isLoading } = useQuery({
    queryKey: ["indexing-progress", projectId ?? ""],
    queryFn: async () => {
      if (!projectId) return { status: 'IDLE', processed: 0, total: 0 } as any;
      return await getIndexingProgress(projectId);
    },
    enabled: !!projectId,
    refetchInterval: 2000,
  });

  const status = (data as any)?.status as string | undefined;
  const processed = (data as any)?.processed ?? 0;
  const total = (data as any)?.total ?? 0;
  const message = (data as any)?.message as string | undefined;

  if (!projectId) return null;
  if (isLoading) return null;
  if (status !== 'INDEXING') return null;

  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return (
    <div className="my-3 p-3 border rounded-md bg-card">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="font-medium">Indexing repository files…</span>
        {total > 0 && <span className="text-muted-foreground">{processed}/{total} ({pct}%)</span>}
      </div>
      <div className="mt-2 h-2 w-full bg-muted rounded">
        <div
          className="h-2 bg-primary rounded"
          style={{ width: `${pct}%`, transition: 'width 0.3s ease' }}
        />
      </div>
    </div>
  );
};

export default IndexingProgress;
