"use client";

import { getProjectCommits } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React from "react";

// Skeleton component for a single commit item
const CommitSkeleton = ({ isLast }: {isLast: boolean}) => (
  <li className="relative flex gap-x-4">
    <div
      className={cn(
        isLast ? "h-6" : "-bottom-6",
        "absolute left-0 top-0 w-8 flex justify-center"
      )}
    >
      <div className="w-px bg-gray-200"></div>
    </div>
    <div className="relative mt-4 size-8 rounded-full bg-gray-200 animate-pulse"></div>
    <div className="flex-auto rounded-md bg-white p-3 ring-1 ring-inset ring-gray-200 space-y-2">
      <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse"></div>
      <div className="h-4 w-1/2 bg-gray-200 rounded animate-pulse"></div>
      <div className="h-16 w-full bg-gray-200 rounded animate-pulse"></div>
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
    <ul className="space-y-6">
      {commits.map((commit, commitIndex) => (
        <li key={commit.id} className="relative flex gap-x-4">
          <div
            className={cn(
              commitIndex === commits.length - 1 ? "h-6" : "-bottom-6",
              "absolute left-0 top-0 w-8 flex justify-center"
            )}
          >
            <div className="w-px bg-gray-300"></div>
          </div>
          <Image
            src={commit.commitAuthorAvatar}
            alt={commit.commitAuthorName}
            width={128}
            height={128}
            className="relative mt-4 size-8 flex-none rounded-full bg-gray-50"
          />
          <div className="flex-auto rounded-md bg-white p-3 ring-1 ring-inset ring-gray-200">
            <div className="flex justify-between gap-x-4">
              <Link
                href={`${project?.githubUrl}/commit/${commit.commitHash}`}
                target="_blank"
                className="py-0.5 text-xs leading-5 text-gray-500"
              >
                <span className="font-medium text-gray-900">
                  {commit.commitAuthorName}
                </span>{" "}
                <span className="inline-flex items-center">
                  committed
                  <ExternalLink className="ml-1 size-4" />
                </span>
              </Link>
            </div>
            <span className="font-semibold">{commit.commitMessage}</span>
            <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-500">
              {commit.summary}
            </pre>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default CommitLogs;