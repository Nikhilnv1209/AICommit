"use client";

import { getProjectTeam } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const TeamMembers = () => {
  const { project } = useProject();

  const { data, isLoading } = useQuery({
    queryKey: ["team-members", project?.id],
    queryFn: async () => {
      if (!project?.id) return null;
      const { success, team } = await getProjectTeam(project.id);
      if (success) {
        return team;
      }
      return null;
    },
    enabled: !!project?.id,
  });

  if (isLoading) {
    return (
      <div className="flex -space-x-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-8 rounded-full ring-2 ring-white bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  const members = data ?? [];
  const maxVisible = 5;
  const visible = members.slice(0, maxVisible);
  const extra = Math.max(0, members.length - maxVisible);

  const getInitials = (first?: string | null, last?: string | null) => {
    const f = (first || "").trim();
    const l = (last || "").trim();
    return `${f?.[0] ?? ""}${l?.[0] ?? ""}`.toUpperCase() || "?";
  };

  return (
    <div className="flex items-center">
      <TooltipProvider>
        <div className="flex -space-x-2">
          {visible.map(({ user }) => {
            const hasImage = Boolean(user.imageUrl);
            const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
            return (
              <Tooltip key={user.id}>
                <TooltipTrigger asChild>
                  <div className="relative inline-flex h-8 w-8 rounded-full ring-2 ring-white overflow-hidden bg-gray-200">
                    {hasImage ? (
                      <Image
                        src={user.imageUrl!}
                        alt={name || "Team member"}
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-600">
                        {getInitials(user.firstName, user.lastName)}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-bold">{name || "Unknown"}</p>
                  {user.emailAddress ? <p>{user.emailAddress}</p> : null}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {extra > 0 && (
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-700 ring-2 ring-white">
              +{extra}
            </div>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
};

export default TeamMembers;
