"use client";

import { reindexProject } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Loader2, RefreshCw, AlertCircle, XCircle, CheckCircle2, Sparkles, Zap, GitCommit, FileCode } from "lucide-react";

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
  const [reindexTrigger, setReindexTrigger] = useState(0);

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
  }, [projectId, reindexTrigger]);

  const reindexMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) return;
      // Reset state first so UI shows connecting state BEFORE server call
      setStatus({ status: 'INDEXING', processed: 0, total: 0 });
      setDisplayStage(undefined);
      setDisplayProgress(0);
      setShowCompletionFeedback(false);
      stageStartTimeRef.current = 0;
      pendingStageRef.current = undefined;
      pendingProgressRef.current = { processed: 0, total: 0 };
      prevStatusRef.current = 'INDEXING';
      
      // Start the indexing first (this will update the database)
      await reindexProject(projectId);
      
      // Small delay to let the indexing status propagate to database
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Now trigger SSE reconnection AFTER indexing has started
      setReindexTrigger(prev => prev + 1);
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

    // Stage-specific styling - using app's primary violet color
    const stageStyles: Record<string, { gradient: string; glow: string }> = {
      FETCHING: {
        gradient: 'from-violet-950/90 via-indigo-900/80 to-slate-950/90',
        glow: 'shadow-violet-500/20',
      },
      PROCESSING: {
        gradient: 'from-violet-950/90 via-purple-900/80 to-fuchsia-950/90',
        glow: 'shadow-violet-500/20',
      },
      COMMIT_DIFFS: {
        gradient: 'from-violet-950/90 via-indigo-900/80 to-purple-950/90',
        glow: 'shadow-violet-500/20',
      }
    };

    const currentStageStyle = effectiveStage ? stageStyles[effectiveStage] : stageStyles.FETCHING;

    return (
      <div className={`my-3 relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br ${currentStageStyle.gradient} ${currentStageStyle.glow} shadow-2xl min-h-[160px]`}>
        {/* Animated background particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-4 left-1/4 w-1.5 h-1.5 bg-violet-400/30 rounded-full animate-pulse" style={{ animationDuration: '3s' }} />
          <div className="absolute top-8 right-1/3 w-1 h-1 bg-violet-300/20 rounded-full animate-pulse" style={{ animationDuration: '3.5s', animationDelay: '1s' }} />
          <div className="absolute bottom-16 left-1/3 w-1 h-1 bg-purple-300/20 rounded-full animate-pulse" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
          <div className="absolute top-1/3 right-12 w-1.5 h-1.5 bg-violet-300/20 rounded-full animate-pulse" style={{ animationDuration: '4s', animationDelay: '1.5s' }} />
        </div>

        <div className="relative p-4 flex flex-col h-full">
          {/* Header - All inline horizontally */}
          <div className="flex items-center gap-3 mb-3">
            {/* Loader */}
            <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/30 flex-shrink-0">
              <Loader2 className="h-5 w-5 text-white animate-[spin_2s_linear_infinite]" />
            </div>

            {/* Title and file count */}
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-white tracking-tight">
                {isConnecting ? 'Connecting...' : stageLabel}
              </h3>
              {!isConnecting && (
                <p className="text-xs text-violet-200/60">
                  {Math.min(effectiveProcessed, effectiveTotal)} / {effectiveTotal} files
                </p>
              )}
            </div>

            {/* File box - inline horizontally */}
            <div className="w-[45%] px-3 py-2 bg-black/20 rounded-lg border border-primary/20 h-10 flex items-center flex-shrink-0">
              {currentItemDisplay && effectiveStage !== 'FETCHING' ? (
                <div className="flex items-center gap-2 text-sm text-violet-100/80 w-full">
                  {effectiveStage === 'COMMIT_DIFFS' ? (
                    <GitCommit className="w-4 h-4 text-primary flex-shrink-0" />
                  ) : (
                    <FileCode className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                  <span className="truncate font-mono text-xs">{currentItemDisplay}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-violet-200/40 w-full">
                  <FileCode className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs italic">Preparing...</span>
                </div>
              )}
            </div>

            {/* Right: Percentage */}
            {!isConnecting && (
              <div className="text-right flex-shrink-0 w-16">
                <span className="text-2xl font-bold text-white tabular-nums">
                  {pct}
                  <span className="text-sm text-violet-200/60">%</span>
                </span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="relative h-2 bg-black/30 rounded-full overflow-hidden">
            <div
              className="absolute inset-0 bg-gradient-to-r from-primary via-primary/80 to-primary/60 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${pct}%`, minWidth: pct > 0 ? '4px' : '0' }}
            />
            <div 
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_3s_ease-in-out_infinite]"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Stage indicators - Slowed animations */}
          <div className="mt-auto pt-3 flex gap-3">
            {stages.map((s, i) => {
              const isActive = currentStageIndex === i;
              const isDone = currentStageIndex > i;
              
              return (
                <div key={s} className="flex-1 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-500 flex-shrink-0 ${
                      isDone 
                        ? 'bg-primary text-white' 
                        : isActive 
                          ? 'bg-white text-primary' 
                          : 'bg-white/10 text-white/40'
                    }`}>
                      {isDone ? '✓' : i + 1}
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider transition-colors duration-500 truncate ${
                      isActive ? 'text-white font-medium' : isDone ? 'text-violet-200/70' : 'text-white/40'
                    }`}>
                      {s.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden bg-black/30">
                    <div 
                      className={`h-full rounded-full transition-all duration-700 ${
                        isDone 
                          ? 'w-full bg-primary' 
                          : isActive 
                            ? 'w-full bg-primary/60' 
                            : 'w-0'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Corner decorations */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/10 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/10 to-transparent pointer-events-none" />
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
      <div className="my-3 relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-violet-950/90 via-indigo-900/80 to-purple-950/90 shadow-2xl min-h-[160px]">
        {/* Animated background particles - slow pulse */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-4 left-1/4 w-2 h-2 bg-violet-400/30 rounded-full animate-pulse" style={{ animationDuration: '3s' }} />
          <div className="absolute top-8 right-1/3 w-1.5 h-1.5 bg-purple-300/20 rounded-full animate-pulse" style={{ animationDuration: '3.5s', animationDelay: '0.5s' }} />
          <div className="absolute bottom-16 left-1/3 w-1 h-1 bg-indigo-300/20 rounded-full animate-pulse" style={{ animationDuration: '3s', animationDelay: '1s' }} />
          <div className="absolute top-1/3 right-12 w-2 h-2 bg-violet-300/20 rounded-full animate-pulse" style={{ animationDuration: '4s', animationDelay: '1.5s' }} />
          
          {/* Floating sparkles */}
          <Sparkles className="absolute top-3 right-12 w-4 h-4 text-violet-300/40 animate-pulse" style={{ animationDuration: '3s' }} />
          <Zap className="absolute bottom-4 left-12 w-3 h-3 text-yellow-300/30 animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        <div className="relative p-4 flex flex-col h-full">
          {/* Header - All inline horizontally */}
          <div className="flex items-center gap-3 mb-3">
            {/* Checkmark */}
            <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/30 flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>

            {/* Title */}
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-white tracking-tight">
                <span className="bg-gradient-to-r from-violet-300 via-purple-200 to-indigo-300 bg-clip-text text-transparent">
                  Repository Indexed!
                </span>
              </h3>
              <p className="text-xs text-violet-200/60">
                All stages completed
              </p>
            </div>

            {/* Summary box - inline */}
            <div className="w-[45%] px-3 py-2 bg-black/20 rounded-lg border border-primary/20 h-10 flex items-center flex-shrink-0">
              <p className="text-sm text-violet-100/80 truncate w-full">
                {completionSummary}
              </p>
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => setShowCompletionFeedback(false)}
              className="flex-shrink-0 p-1.5 rounded-full text-violet-200/60 hover:text-white hover:bg-white/10 transition-all duration-200"
              title="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          <div className="relative h-2 bg-black/30 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary/60 rounded-full animate-[shimmer_3s_ease-in-out_infinite]" style={{ width: '100%' }} />
          </div>

          {/* Stage indicators */}
          <div className="mt-auto pt-3 flex gap-3">
            {['FETCHING', 'PROCESSING', 'COMMIT_DIFFS'].map((s, i) => (
              <div key={s} className="flex-1 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-primary text-white flex-shrink-0">
                    ✓
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-violet-200/70 truncate">
                    {s.replace('_', ' ')}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden bg-black/30">
                  <div className="h-full w-full rounded-full bg-primary" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Corner decorations */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/10 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/10 to-transparent pointer-events-none" />
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
