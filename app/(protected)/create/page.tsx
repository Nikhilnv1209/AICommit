"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from '@hookform/resolvers/zod'
import { createFormSchema, TFormData } from "@/utils/schema";
import { submitCreateForm, checkRepoCredits } from "@/app/actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import useProject from "@/hooks/use-project";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";


const CreatePage = () => {
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<TFormData>({ resolver: zodResolver(createFormSchema) })
  const { refreshProjects, setProjectId } = useProject();
  const router = useRouter();

  const repoUrl = watch("repoUrl");
  const githubToken = watch("githubToken");

  const [checkingCredits, setCheckingCredits] = useState(false);
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [userCredits, setUserCredits] = useState<number | null>(null);
  const [sufficient, setSufficient] = useState<boolean | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSubmit = async (data: TFormData) => {
      if (checkingCredits) {
        toast.message("Please wait, checking credits...");
        return;
      }
      if (sufficient === false) {
        toast.error("Insufficient credits for this repository");
        return;
      }
      const response = await submitCreateForm(data);

      if (response?.error) {
        toast.error(response?.error)// Show error toast
      } else {
        toast.success(response.success); // Show success toast
        reset(); // Reset form on success
        refreshProjects(); // Refresh projects list

        // Set the newly created project as selected and redirect to dashboard
        if (response.projectId) {
          setProjectId(response.projectId);
          router.push("/dashboard");
        }
      }
  } 

  // Debounced credit check when repoUrl looks valid
  useEffect(() => {
    const validGithub = repoUrl && repoUrl.startsWith("https://github.com/");
    if (!validGithub) {
      setFileCount(null);
      setUserCredits(null);
      setSufficient(null);
      setCreditError(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setCheckingCredits(true);
        setCreditError(null);
        const data = await checkRepoCredits(repoUrl!, githubToken || undefined);
        if ((data as any)?.error) throw new Error((data as any).error);
        setFileCount((data as any).fileCount ?? null);
        setUserCredits((data as any).userCredits ?? null);
        setSufficient(Boolean((data as any).sufficient));
      } catch (e: any) {
        setCreditError(e?.message || "Failed to check credits");
        setFileCount(null);
        setUserCredits(null);
        setSufficient(null);
      } finally {
        setCheckingCredits(false);
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [repoUrl, githubToken]);

  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 h-full p-4">
      <img src="/create_page.svg" className="h-40 w-auto md:h-56" />
      <div className="w-full max-w-md">
        <div>
          <h1 className="font-mono text-2xl font-medium tracking-tight text-center">
            Link your Github Repository
          </h1>
          <p className="text-sm text-muted-foreground text-center font-mono">
            Connect your Github repository to start using AICommit
          </p>
        </div>
        <div className="h-4"></div>
        <div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
            <div>
            <Input
              {...register("projectName", { required: true })}
              placeholder="Project Name"
              />
              {errors.projectName && <p className="text-destructive text-xs my-1 ml-1">{errors.projectName.message}</p>}
            </div>
            <div>
              <Input
                {...register("repoUrl", { required: true })}
                placeholder="Github URL"
                type="url"
              />
              {errors.repoUrl && <p className="text-destructive text-xs my-1 ml-1">{errors.repoUrl.message}</p>}
            </div>
            <div>
            <Input
              {...register("githubToken")}
              placeholder="Github Token(Optional)"
            />
            {errors.githubToken && <p className="text-destructive text-xs my-1 ml-1">{errors.githubToken.message}</p>}
            </div>
            {(!checkingCredits && (creditError || fileCount !== null)) && (
              <div className="rounded-md border border-border bg-card p-3 mb-2 flex flex-col gap-1 font-mono text-xs">
                {creditError && (
                  <div className="text-destructive">{creditError}</div>
                )}
                {!creditError && fileCount != null && userCredits != null && (
                  <div className="flex flex-col gap-0.5">
                    <span>Files to index: <span className="font-medium">{fileCount}</span> (credits required)</span>
                    <span>Your credits: <span className="font-medium">{userCredits}</span></span>
                    {sufficient === false && (
                      <span className="text-destructive">Not enough credits to create this project.</span>
                    )}
                    {sufficient === true && (
                      <span className="text-primary">You have sufficient credits.</span>
                    )}
                  </div>
                )}
              </div>
            )}
            <Button disabled={isSubmitting || checkingCredits || sufficient === false} className="w-full">
              {(isSubmitting || checkingCredits) && <Loader2 className="animate-spin mr-2"/>}
              {checkingCredits ? "Checking credits..." : "Create Project"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default CreatePage
