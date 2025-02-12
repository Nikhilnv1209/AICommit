"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from '@hookform/resolvers/zod'
import { createFormSchema, TFormData } from "@/utils/schema";
import { submitCreateForm } from "@/app/actions";
import { toast } from "sonner";


const CreatePage = () => {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<TFormData>({ resolver: zodResolver(createFormSchema) })

  const onSubmit = async (data: TFormData) => {
      const response = await submitCreateForm(data);

      if (response?.error) {
        toast.error("invalid input")
        console.log(response.error); // Show error toast
      } else {
        toast.success(response.success); // Show success toast
        reset(); // Reset form on success
      }
  } 

  return (
    <div className="flex items-center justify-center gap-12 h-full">
      <img src="/create_page.svg" className="h-56 w-auto" />
      <div>
        <div>
          <h1 className="font-semibold text-2xl text-center">
            Link your Github Repository
          </h1>
          <p className="text-sm text-muted-foreground">
            Connect your Github repository for start using AICommit
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
              {errors.projectName && <p className="text-red-400 text-xs my-1 ml-1">{errors.projectName.message}</p>}
            </div>
            <div>
              <Input
                {...register("repoUrl", { required: true })}
                placeholder="Github URL"
                type="url"
              />
              {errors.repoUrl && <p className="text-red-400 text-xs my-1 ml-1">{errors.repoUrl.message}</p>}
            </div>
            <div>
            <Input
              {...register("githubToken")}
              placeholder="Github Token(Optional)"
            />
            {errors.githubToken && <p className="text-red-400 text-xs my-1 ml-1">{errors.githubToken.message}</p>}
            </div>
            <Button>
              Create Project
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default CreatePage