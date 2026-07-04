"use client";

import { getProjectCommitsPage } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Calendar, GitCommit } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type CommitsPage = { items: any[]; nextCursor: string | null };

const CommitSkeleton = () => (
  <li className="flex gap-3 min-w-0">
    <div className="mt-0.5 size-8 flex-none animate-pulse rounded-full bg-muted ring-2 ring-card" />
    <div className="flex-auto space-y-2 rounded-lg border border-border bg-background/50 p-3.5">
      <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-12 w-full animate-pulse rounded bg-muted/50" />
    </div>
  </li>
);

const CommitLogs = () => {
  const { projectId, project } = useProject();

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<CommitsPage, Error, CommitsPage, [string, string], string | null>({
    queryKey: ["projectCommits", projectId ?? ""],
    queryFn: async ({ pageParam }) => {
      if (!projectId) return { items: [], nextCursor: null };
      return await getProjectCommitsPage(projectId, {
        limit: 10,
        cursor: (pageParam as string | null) ?? null,
        githubUrl: project?.githubUrl,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null,
    enabled: !!projectId,
    refetchOnWindowFocus: false,
  });

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (isLoading) {
      toast.loading("Loading commits...", { id: "loading-commits-initial" });
    } else {
      toast.dismiss("loading-commits-initial");
    }
  }, [mounted, isLoading]);

  useEffect(() => {
    if (!mounted) return;
    if (isFetchingNextPage) {
      toast.loading("Loading more commits...", { id: "loading-commits-more" });
    } else {
      toast.dismiss("loading-commits-more");
    }
  }, [mounted, isFetchingNextPage]);

  const commits: any[] = ((data as any)?.pages as CommitsPage[] | undefined)?.flatMap((p) => p.items) ?? [];

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!mounted) return;
    if (!sentinelRef.current) return;
    if (!hasNextPage) return;

    const node = sentinelRef.current;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          fetchNextPage();
        }
      }
    }, { rootMargin: "200px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted, hasNextPage, fetchNextPage]);

  const fmtDate = (d: string | Date) => new Date(d).toLocaleString("en-US", { timeZone: "UTC" });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="font-mono text-[11px] text-primary">{"// commit history"}</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {project ? "main" : "no repo"}
        </span>
      </div>
      <div className="p-5">
        <ul className="space-y-3 overflow-x-hidden">
          {!mounted && (
            <>
              {Array.from({ length: 3 }).map((_, index) => (
                <CommitSkeleton key={index} />
              ))}
            </>
          )}

          {mounted && isLoading && (
            <>
              {Array.from({ length: 3 }).map((_, index) => (
                <CommitSkeleton key={index} />
              ))}
            </>
          )}

          {mounted && isError && !isLoading && (
            <li className="font-mono text-xs text-destructive">
              error: {error?.message}
            </li>
          )}

          {mounted && !isLoading && !isError && commits.length === 0 && (
            <li className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 rounded-lg border border-border bg-background p-3">
                <GitCommit className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-mono text-sm font-medium">no commits yet</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                push to your repo to see them here
              </p>
            </li>
          )}

          {mounted && commits.map((commit: any) => (
            <li key={commit.id} className="flex gap-3 min-w-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Image
                      src={commit.commitAuthorAvatar}
                      alt={commit.commitAuthorName}
                      width={128}
                      height={128}
                      className="mt-0.5 size-8 flex-none rounded-full bg-muted ring-2 ring-card"
                    />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs break-words">
                    <div className="text-primary-foreground">
                      <div className="font-medium">{commit.commitAuthorName}</div>
                      <div className="mt-1 flex items-center gap-1 text-xs opacity-90">
                        <Calendar className="size-3" />
                        <span>{fmtDate(commit.commitDate)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs opacity-90">
                        <GitCommit className="size-3" />
                        <span className="truncate">{commit.commitHash}</span>
                      </div>
                      <div className="mt-2 text-xs opacity-90 line-clamp-4 whitespace-pre-wrap">
                        {commit.commitMessage}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex-auto min-w-0 rounded-lg border border-border bg-background/50 p-3.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`${project?.githubUrl}/commit/${commit.commitHash}`}
                    target="_blank"
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {commit.commitHash?.slice(0, 7)}
                  </Link>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-xs font-medium">{commit.commitAuthorName}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {fmtDate(commit.commitDate)}
                  </span>
                </div>
                <p className="mt-2 break-words text-sm font-medium text-foreground">
                  {commit.commitMessage}
                </p>
                {commit.summary && (
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
                    {commit.summary}
                  </pre>
                )}
              </div>
            </li>
          ))}

          <li>
            <div ref={sentinelRef} />
            {isFetchingNextPage && (
              <div className="mt-2 font-mono text-[10px] text-muted-foreground">loading more…</div>
            )}
            {!hasNextPage && commits.length > 0 && (
              <div className="mt-2 font-mono text-[10px] text-muted-foreground">end of history</div>
            )}
          </li>
        </ul>
      </div>
    </div>
  );
};

export default CommitLogs;
