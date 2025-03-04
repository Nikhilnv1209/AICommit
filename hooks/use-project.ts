"use client";

import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/app/actions"; // Server action
import { useLocalStorage } from "usehooks-ts";
import { getQueryClient } from "@/lib/react-query";


const useProject = () => {
  const queryClient = getQueryClient();
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => await getProjects(),
  });

  const [projectId, setProjectId] = useLocalStorage<string | null>("aicommit_projectid", null);

  const project = projects?.find((p) => p.id === projectId);

  const refreshProjects = () => {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  return { projects, project, projectId, setProjectId, refreshProjects, isLoading, error };
};

export default useProject;
