"use client";

import { getProjectCommits } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Calendar, GitCommit } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

  const { data: commits, status, error } = useQuery({
    queryKey: ["projectCommits", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      return await getProjectCommits(projectId, project?.githubUrl);
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Show skeleton loader during initial fetch
  if (status === "pending") {
    return <SkeletonLoader />;
  }

  // Handle fetch errors
  if (status === "error") {
    return (
      <div className="text-red-500">
        Error fetching commits: {error.message}
      </div>
    );
  }

  // Handle case where no commits are returned
  if (commits.length === 0) {
    return <div>No commits found.</div>;
  }

  // Render the commit list when data is successfully fetched
  return (
    <ul className="space-y-6 overflow-x-hidden">
      {commits.map((commit, commitIndex) => (
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
                    <span>{new Date(commit.commitDate).toLocaleString()}</span>
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
    </ul>
  );
};

export default CommitLogs;
