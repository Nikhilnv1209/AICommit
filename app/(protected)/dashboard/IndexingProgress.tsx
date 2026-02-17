"use client";

import { getIndexingProgress, reindexProject } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, AlertCircle, CheckCircle, XCircle } from "lucide-react";

const IndexingProgress = () => {
  const { projectId } = useProject();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["indexing-progress", projectId ?? ""],
    queryFn: async () => {
      if (!projectId) return { status: 'IDLE', processed: 0, total: 0 };
      return await getIndexingProgress(projectId);
    },
    enabled: !!projectId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Stop polling when not actively indexing
      if (status !== 'INDEXING') return false;
      return 2000;
    },
  });

  const reindexMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) return;
      return await reindexProject(projectId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["indexing-progress", projectId] });
    },
  });

  const status = data?.status as string | undefined;
  const processed = data?.processed ?? 0;
  const total = data?.total ?? 0;
  const message = data?.message as string | undefined;

  if (!projectId) return null;
  if (isLoading) return null;

  // Show progress bar when indexing
  if (status === 'INDEXING') {
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
  }

  // Show status message and reindex button for ERROR or IDLE states
  if (status === 'ERROR' || status === 'IDLE') {
    return (
      <div className="my-3 p-3 border rounded-md bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {status === 'ERROR' && (
              <>
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-red-600">Indexing failed</span>
              </>
            )}
            {status === 'IDLE' && (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <span className="text-yellow-600">Not indexed</span>
              </>
            )}
          </div>
          <button
            onClick={() => reindexMutation.mutate()}
            disabled={reindexMutation.isPending}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {reindexMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {status === 'IDLE' ? 'Index' : 'Reindex'}
          </button>
        </div>
        {message && status === 'ERROR' && (
          <p className="mt-2 text-xs text-red-500">{message}</p>
        )}
      </div>
    );
  }

  // Show compact reindex button for COMPLETED state
  if (status === 'COMPLETED') {
    return (
      <div className="my-3 flex justify-end">
        <button
          onClick={() => reindexMutation.mutate()}
          disabled={reindexMutation.isPending}
          className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md disabled:opacity-50"
          title="Reindex project"
        >
          {reindexMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Reindex
        </button>
      </div>
    );
  }

  return null;
};

export default IndexingProgress;
