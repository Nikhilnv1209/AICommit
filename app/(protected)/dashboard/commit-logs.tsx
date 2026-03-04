"use client";

import { getProjectCommitsPage } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { cn } from "@/lib/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ExternalLink, Calendar, GitCommit } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type CommitsPage = { items: any[]; nextCursor: string | null };

// Skeleton component for a single commit item
const CommitSkeleton = ({ isLast }: {isLast: boolean}) => (
  <li className="relative flex gap-x-4 pr-8 md:pr-0 min-w-0">
    <div
      className={cn(
        isLast ? "h-6" : "-bottom-6",
        "absolute left-0 top-0 w-8 flex justify-center"
      )}
    >
      <div className="w-px bg-border"></div>
    </div>
    <div className="relative mt-4 size-8 rounded-full bg-muted animate-pulse"></div>
    <div className="flex-auto rounded-md bg-card p-3 ring-1 ring-inset ring-border space-y-2">
      <div className="h-4 w-3/4 bg-muted rounded animate-pulse"></div>
      <div className="h-4 w-1/2 bg-muted rounded animate-pulse"></div>
      <div className="h-16 w-full bg-muted rounded animate-pulse"></div>
    </div>
  </li>
);

// Skeleton loader displaying three placeholder commit items
const SkeletonLoader = () => (
  <ul className="space-y-6">
    {Array.from({ length: 3 }).map((_, index) => (
      <CommitSkeleton key={index} isLast={index === 2} />
    ))}
  </ul>
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

  // Ensure server and client render the same initial markup to avoid hydration mismatches
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Persistent loading toasts while fetching
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

  // IntersectionObserver sentinel for infinite loading
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

  // Render the commit list when data is successfully fetched
  return (
    <ul className="space-y-6 overflow-x-hidden">
      {/* Pre-hydration placeholder to keep SSR/CSR markup identical */}
      {!mounted && (
        <>
          {Array.from({ length: 3 }).map((_, index) => (
            <CommitSkeleton key={index} isLast={index === 2} />
          ))}
        </>
      )}

      {/* Loading state */}
      {mounted && isLoading && (
        <>
          {Array.from({ length: 3 }).map((_, index) => (
            <CommitSkeleton key={index} isLast={index === 2} />
          ))}
        </>
      )}

      {/* Error state */}
      {mounted && isError && !isLoading && (
        <li className="text-red-500">Error fetching commits: {error?.message}</li>
      )}

      {/* Empty state */}
      {mounted && !isLoading && !isError && commits.length === 0 && (
        <li className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <GitCommit className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-lg font-medium text-foreground">No commits yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Push some commits to your GitHub repository to see them here
          </p>
        </li>
      )}

      {/* Data items */}
      {mounted && commits.map((commit: any, commitIndex: number) => (
        <li key={commit.id} className="relative flex gap-x-4 pr-8 md:pr-0 min-w-0">
          <div
            className={cn(
              commitIndex === commits.length - 1 ? "h-6" : "-bottom-6",
              "absolute left-0 top-0 w-8 flex justify-center"
            )}
          >
            <div className="w-px bg-border"></div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Image
                  src={commit.commitAuthorAvatar}
                  alt={commit.commitAuthorName}
                  width={128}
                  height={128}
                  className="relative mt-4 size-8 flex-none rounded-full bg-muted"
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
          <div className="flex-auto rounded-md bg-card p-3 ring-1 ring-inset ring-border min-w-0">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-2">
              <Link
                href={`${project?.githubUrl}/commit/${commit.commitHash}`}
                target="_blank"
                className="py-0.5 text-xs leading-5 text-muted-foreground"
              >
                <span className="font-medium text-foreground">
                  {commit.commitAuthorName}
                </span>{" "}
                <span className="inline-flex items-center">
                  committed
                  <ExternalLink className="ml-1 size-4" />
                </span>
              </Link>
            </div>
            <p className="font-semibold break-words">{commit.commitMessage}</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground overflow-x-auto">
              {commit.summary}
            </pre>
          </div>
        </li>
      ))}
      {/* Infinite loader sentinel */}
      <li>
        <div ref={sentinelRef} />
        {isFetchingNextPage && <div className="mt-2 text-xs text-muted-foreground">Loading more...</div>}
        {!hasNextPage && commits.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">End of commit history</div>
        )}
      </li>
    </ul>
  );
};

export default CommitLogs;
