"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProjects } from "@/app/actions"; // Server action
import useLocalStorage from "./useLocalStorage";


const useProject = () => {
  const queryClient = useQueryClient();
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
  });

  const [projectId, setProjectId] = useLocalStorage<string | null>("aicommit_projectid", null);

  const project = useMemo(() => {
    return projects?.find((p) => p.id === projectId) || null;
  }, [projects, projectId]);

  const refreshProjects = () => {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  return { projects, project, projectId, setProjectId, refreshProjects, isLoading, error };
};

export default useProject;
