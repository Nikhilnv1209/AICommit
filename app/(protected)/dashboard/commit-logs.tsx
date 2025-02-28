"use client";

import { getProjectCommits } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React from "react";

const CommitLogs = () => {
  const { projectId, project } = useProject();

  const { data: commits } = useQuery({
    queryKey: ["projectCommits", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      return await getProjectCommits(projectId, project!.githubUrl)
    },
  });

  return (
    <>
      <ul className="space-y-6">
        {
          commits?.map((commit, commitIndex) => (
            <li key={commit.id} className="relative flex gap-x-4">
              <div className={cn(
                commitIndex === commits.length - 1 ? 'h-6' : '-bottom-6',
                'absolute left-0 top-0 w-8 flex justify-center'
              )}>
                <div className="w-px bg-gray-300"></div>
              </div>

              <>
                <Image src={commit.commitAuthorAvatar} alt={commit.commitAuthorName} width={128} height={128} className="relative mt-4 size-8 flex-none rounded-full bg-gray-50" />
                <div className="flex-auto rounded-md bg-white p-3 ring-1 ring-inset ring-gray-200">
                  <div className="flex justify-between gap-x-4">
                    <Link href={`${project?.githubUrl}/commit/${commit.commitHash}`} target="_blank" className="py-0.5 text-xs leading-5 text-gray-500">
                      <span className="font-medium text-gray-900">
                        {commit.commitAuthorName}
                      </span>{" "}
                      <span className="inline-flex items-center">
                        commited
                        <ExternalLink className="ml-1 size-4" />
                      </span>
                    </Link>
                  </div>
                  <span className="font-semibold">
                    {commit.commitMessage}
                  </span>
                  <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-500">
                    {commit.summary}
                  </pre>
                </div>
              </>
            </li>
          ))
        }
      </ul>
    </>
  );
};


export default CommitLogs;
