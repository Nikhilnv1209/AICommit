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

const DashBoard = () => {
  const { project } = useProject();

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between flex-wrap gap-4">
        {/* GitHub link */}
        <div className="w-full sm:w-fit rounded-md bg-primary px-4 py-3">
          <div className="flex items-center">
            <Github className="text-primary-foreground size-5" />
            <div className="ml-2">
              <p className="text-sm font-medium text-primary-foreground">
                This Project is linked to{" "}
                <Link
                  href={project?.githubUrl || ""}
                  className="inline-flex items-center text-primary-foreground/80 hover:underline"
                >
                  {project?.githubUrl}
                  <ExternalLinkIcon className="ml-1 size-4" />
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <TeamMembers />
          <InviteButton />
          <ArchiveProjectButton />
        </div>
      </div>

      <div className="mt-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <AskQuestionsCard />
          </div>
          <div className="lg:col-span-2 w-full">
            <MeetingCard />
          </div>
        </div>
      </div>

      <div className="mt-8"></div>

      {/* 🔹 Wrap CommitLogs with Suspense */}
      <CommitLogs />
    </div>
  );
};

export default DashBoard;
