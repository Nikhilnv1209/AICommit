"use client";

import { reindexProject } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Loader2, RefreshCw, AlertCircle, XCircle } from "lucide-react";

interface IndexingStatus {
  status: string;
  stage?: string;
  processed: number;
  total: number;
  message?: string;
  errorSummary?: string;
  currentItem?: string;
}

const IndexingProgress = () => {
  const { projectId } = useProject();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<IndexingStatus>({
    status: 'IDLE',
    processed: 0,
    total: 0
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [showCompletionFeedback, setShowCompletionFeedback] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<string>('');

  // For smooth stage transitions
  const [displayStage, setDisplayStage] = useState<string | undefined>(undefined);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [displayCurrentItem, setDisplayCurrentItem] = useState<string>('');
  const stageStartTimeRef = useRef<number>(0);
  const pendingStageRef = useRef<string | undefined>(undefined);
  const pendingProgressRef = useRef<{ processed: number; total: number }>({ processed: 0, total: 0 });
  const pendingCurrentItemRef = useRef<string>('');
  const animationFrameRef = useRef<number | null>(null);
  const prevStatusRef = useRef<string>('IDLE');

  // Smooth progress update logic
  const updateDisplay = () => {
    const now = Date.now();
    const newStage = pendingStageRef.current;

    // Update stage immediately - no minimum duration delay
    // The backend already enforces minimum stage time
    if (newStage !== displayStage && newStage !== undefined) {
      setDisplayStage(newStage);
      stageStartTimeRef.current = now;
    }

    // Update current item being processed
    if (pendingCurrentItemRef.current !== displayCurrentItem) {
      setDisplayCurrentItem(pendingCurrentItemRef.current);
    }

    // Calculate smooth progress
    const { processed, total } = pendingProgressRef.current;
    let targetProgress = 0;

    if (total > 0) {
      const fileProgress = processed / total;

      // Three stages: FETCHING (0-20%), PROCESSING (20-90%), COMMIT_DIFFS (90-100%)
      // Use pendingStage if displayStage not yet set
      const effectiveStage = displayStage || pendingStageRef.current;
      if (effectiveStage === 'FETCHING') {
        targetProgress = fileProgress * 20;
      } else if (effectiveStage === 'PROCESSING') {
        targetProgress = 20 + (fileProgress * 70);
      } else if (effectiveStage === 'COMMIT_DIFFS') {
        targetProgress = 90 + (fileProgress * 10);
      }
    }

    // Update display progress - use faster interpolation for responsiveness
    setDisplayProgress(prev => {
      const diff = targetProgress - prev;
      // If close enough, snap to target
      if (Math.abs(diff) < 1) return targetProgress;
      // Otherwise move 30% of the way there for smooth but responsive animation
      return prev + diff * 0.3;
    });

    animationFrameRef.current = requestAnimationFrame(updateDisplay);
  };

  // Start smooth animation loop
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(updateDisplay);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // SSE connection
  useEffect(() => {
    if (!projectId) return;

    setIsConnecting(true);
    // Add cache-busting parameter to prevent browser caching
    const cacheBuster = Date.now();
    const eventSource = new EventSource(`/api/indexing-progress?projectId=${projectId}&_=${cacheBuster}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const prevStatus = prevStatusRef.current;
        
        // Check if we just completed indexing
        if (prevStatus === 'INDEXING' && data.status === 'COMPLETED') {
          // Show completion feedback
          setCompletionSummary(data.errorSummary || 'Indexing completed successfully');
          setShowCompletionFeedback(true);
          
          // Invalidate commits query to refresh the commit list
          queryClient.invalidateQueries({ queryKey: ["projectCommits", projectId] });
          
          // Auto-hide after 8 seconds
          setTimeout(() => {
            setShowCompletionFeedback(false);
          }, 8000);
        }
        
        prevStatusRef.current = data.status;
        setStatus(data);

        // Update pending refs for smooth transitions
        pendingStageRef.current = data.stage;
        pendingProgressRef.current = { processed: data.processed, total: data.total };
        pendingCurrentItemRef.current = data.currentItem || '';

        // Note: We don't reset display state immediately when indexing completes
        // This allows the UI to show the final 100% state briefly before hiding
        // The parent component will switch to showing the COMPLETED/ERROR state

        setIsConnecting(false);
      } catch (e) {
        console.error('Failed to parse SSE data:', e);
      }
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      setIsConnecting(false);
      eventSource.close();
    };

    eventSource.onopen = () => {
      setIsConnecting(false);
    };

    return () => {
      eventSource.close();
    };
  }, [projectId]);

  const reindexMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) return;
      // Reset state first so UI shows connecting state BEFORE server call
      setStatus({ status: 'INDEXING', processed: 0, total: 0 });
      setDisplayStage(undefined);
      setDisplayProgress(0);
      stageStartTimeRef.current = 0;
      pendingStageRef.current = undefined;
      pendingProgressRef.current = { processed: 0, total: 0 };
      prevStatusRef.current = 'INDEXING';
      // Wait for SSE to connect before starting indexing
      await new Promise(resolve => setTimeout(resolve, 800));
      return await reindexProject(projectId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["indexing-progress", projectId] });
    },
  });

  const { status: currentStatus, processed, total, message } = status;


  if (!projectId) return null;

  // Stage display names
  const stageLabels: Record<string, string> = {
    FETCHING: 'Fetching files from GitHub...',
    PROCESSING: 'Analyzing files with AI...',
    COMMIT_DIFFS: 'Summarizing commit changes...',
  };

  // Show progress bar when indexing or connecting
  if (currentStatus === 'INDEXING' || (isConnecting && currentStatus !== 'COMPLETED')) {
    // Calculate percentage directly from pendingProgressRef for immediate updates
    const { processed: pendingProcessed, total: pendingTotal } = pendingProgressRef.current;
    // Use pendingStage if displayStage not yet set
    const effectiveStage = displayStage || pendingStageRef.current;
    let calculatedPct = 0;

    if (pendingTotal > 0 && effectiveStage) {
      const fileProgress = pendingProcessed / pendingTotal;
      if (effectiveStage === 'FETCHING') {
        calculatedPct = fileProgress * 20;
      } else if (effectiveStage === 'PROCESSING') {
        calculatedPct = 20 + (fileProgress * 70);
      } else if (effectiveStage === 'COMMIT_DIFFS') {
        calculatedPct = 90 + (fileProgress * 10);
      }
    }

    // Use the calculated percentage directly, not the smoothed displayProgress
    const pct = Math.min(100, Math.round(calculatedPct));

    const stageLabel = effectiveStage ? stageLabels[effectiveStage] : 'Indexing repository...';

    // Calculate stage indicators
    const stages = ['FETCHING', 'PROCESSING', 'COMMIT_DIFFS'];
    const currentStageIndex = effectiveStage ? stages.indexOf(effectiveStage) : -1;

    // Show file count during PROCESSING and COMMIT_DIFFS stages when we have data
    // Also check pendingProgressRef as fallback since that's what's used for displayProgress
    const hasProgressData = total > 0 || pendingProgressRef.current.total > 0;
    const effectiveTotal = total > 0 ? total : pendingProgressRef.current.total;
    const effectiveProcessed = total > 0 ? processed : pendingProgressRef.current.processed;
    const showFileCount = (effectiveStage === 'PROCESSING' || effectiveStage === 'COMMIT_DIFFS') && hasProgressData;

    // Get current item from display state
    const currentItemDisplay = displayCurrentItem || pendingCurrentItemRef.current;

    return (
      <div className="my-3 p-3 border rounded-md bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium">
              {isConnecting ? 'Connecting...' : stageLabel}
            </span>
          </div>
          {!isConnecting && (
            <span className="text-sm text-muted-foreground">
              {showFileCount ? `${Math.min(effectiveProcessed, effectiveTotal)}/${effectiveTotal}` : `${pct}%`}
            </span>
          )}
        </div>
        {/* Show current item being processed */}
        {currentItemDisplay && effectiveStage !== 'FETCHING' && (
          <div className="mt-2 text-xs text-muted-foreground truncate">
            {effectiveStage === 'COMMIT_DIFFS' ? '📝 ' : '📄 '}{currentItemDisplay}
          </div>
        )}
        <div className="mt-2 h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-2 bg-primary rounded-full transition-all duration-200 ease-linear"
            style={{ width: `${pct}%`, minWidth: pct > 0 ? '4px' : '0' }}
          />
        </div>
        {/* Stage indicators - 2 stages with proportional widths */}
        <div className="mt-3 flex gap-2">
          {stages.map((s, i) => {
            const isActive = currentStageIndex === i;
            const isDone = currentStageIndex > i;
            // FETCHING gets 20% width, PROCESSING gets 80% width
            // FETCHING: 20%, PROCESSING: 70%, COMMIT_DIFFS: 10%
            const widthClass = i === 0 ? 'w-[20%]' : i === 1 ? 'w-[70%]' : 'w-[10%]';
            return (
              <div key={s} className={`flex items-center gap-1.5 ${widthClass}`}>
                <div
                  className={`h-2 flex-1 rounded-full transition-all duration-500 ${
                    isActive ? 'bg-primary' : isDone ? 'bg-primary/60' : 'bg-muted'
                  }`}
                  title={stageLabels[s]}
                />
                <span className={`text-[10px] uppercase tracking-wider transition-colors duration-300 whitespace-nowrap ${
                  isActive ? 'text-primary font-medium' : isDone ? 'text-primary/60' : 'text-muted-foreground'
                }`}>
                  {s.toLowerCase()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Show status message and reindex button for ERROR, TIMEOUT, or IDLE states
  if (currentStatus === 'ERROR' || currentStatus === 'TIMEOUT' || currentStatus === 'IDLE') {
    return (
      <div className="my-3 p-3 border rounded-md bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {currentStatus === 'ERROR' && (
              <>
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-red-600">Indexing failed</span>
              </>
            )}
            {currentStatus === 'TIMEOUT' && (
              <>
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <span className="text-orange-600">Indexing timed out</span>
              </>
            )}
            {currentStatus === 'IDLE' && (
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
            {(currentStatus === 'IDLE' || currentStatus === 'TIMEOUT') ? 'Index' : 'Reindex'}
          </button>
        </div>
        {/* Show error summary or detailed message */}
        {(status.errorSummary || message) && (currentStatus === 'ERROR' || currentStatus === 'TIMEOUT') && (
          <div className="mt-2 space-y-1">
            {status.errorSummary && (
              <p className="text-xs font-medium text-orange-600">{status.errorSummary}</p>
            )}
            {message && (
              <p className="text-xs text-red-500">{message}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Show completion feedback for a few seconds after indexing completes
  if (currentStatus === 'COMPLETED' && showCompletionFeedback) {
    return (
      <div className="my-3 p-3 border rounded-md bg-card">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-green-600">Indexing Complete!</p>
            <p className="text-xs text-muted-foreground mt-1">{completionSummary}</p>
          </div>
          <button
            onClick={() => setShowCompletionFeedback(false)}
            className="text-muted-foreground hover:text-foreground"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  // Show compact reindex button for COMPLETED state
  if (currentStatus === 'COMPLETED') {
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
