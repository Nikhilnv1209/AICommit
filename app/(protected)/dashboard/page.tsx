"use client";

import useProject from "@/hooks/use-project";
import { ExternalLinkIcon, Github } from "lucide-react";
import Link from "next/link";
import CommitLogs from "./commit-logs";
import AskQuestionsCard from "./ask-questions-card";
import MeetingCard from "../meetings/meeting-card";
import ArchiveProjectButton from "./ArchiveProjectButton";
import InviteButton from "./InviteButton";
import TeamMembers from "./team-members";
import IndexingProgress from "./IndexingProgress";

const DashBoard = () => {
  const { project } = useProject();

  return (
    <div className="w-full">
      {/* Workspace header */}
      <div className="border-b border-border pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-2.5">
              <Github className="size-4 shrink-0 text-primary" />
              {project ? (
                <p className="font-mono text-xs">
                  <span className="text-muted-foreground">repo </span>
                  <Link
                    href={project.githubUrl || ""}
                    target="_blank"
                    className="text-primary hover:underline"
                  >
                    {project.githubUrl}
                    <ExternalLinkIcon className="ml-1 inline size-3" />
                  </Link>
                </p>
              ) : (
                <p className="font-mono text-xs text-muted-foreground">no project linked</p>
              )}
            </div>
            {project && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                <span className="font-mono text-xs text-muted-foreground">active</span>
              </div>
            )}
          </div>
          {project && (
            <div className="flex flex-wrap items-center gap-2">
              <TeamMembers />
              <InviteButton />
              <ArchiveProjectButton />
            </div>
          )}
        </div>
      </div>

      {project && <IndexingProgress />}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <AskQuestionsCard />
        </div>
        <div className="lg:col-span-2">
          <MeetingCard />
        </div>
      </div>

      <div className="mt-5">
        <CommitLogs />
      </div>
    </div>
  );
};

export default DashBoard;
