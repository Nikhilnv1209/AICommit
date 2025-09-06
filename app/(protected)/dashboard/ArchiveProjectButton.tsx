"use client";

import { archiveProject } from "@/app/actions";
import { Button } from "@/components/ui/button";
import useProject from "@/hooks/use-project";
import { useMutation } from "@tanstack/react-query";
import { Archive } from "lucide-react";
import { toast } from "sonner";

const ArchiveProjectButton = () => {
  const { project, refreshProjects, setProjectId } = useProject();

  const { mutate: archive, isPending } = useMutation({
    mutationFn: archiveProject,
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Project archived successfully!");
        refreshProjects();
        setProjectId(null);
      } else {
        toast.error(result.error || "Failed to archive project.");
      }
    },
    onError: (error) => {
      toast.error(error.message || "An unexpected error occurred.");
    },
  });

  const handleArchive = () => {
    if (project) {
      archive(project.id);
    }
  };

  return (
    <Button
      variant="destructive"
      onClick={handleArchive}
      disabled={isPending || !project}
      className="px-2 sm:px-4"
    >
      <Archive className="h-4 w-4" />
      <span className="ml-2 hidden sm:inline">{isPending ? "Archiving..." : "Archive Project"}</span>
    </Button>
  );
};

export default ArchiveProjectButton;
