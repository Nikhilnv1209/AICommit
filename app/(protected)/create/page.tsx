"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
type TformInput = {
  repoUrl: string
  projectName: string
  githubToken?: string
}

const CreatePage = () => {
  const { register, handleSubmit, reset } = useForm<TformInput>()

  const onSubmit = (data: TformInput) => {
    window.alert(JSON.stringify(data))
    return true
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
            <Input
              {...register("projectName", { required: true })}
              placeholder="Project Name"
            />
            <Input
              {...register("repoUrl", { required: true })}
              placeholder="Github URL"
              type="url"
            />
            <Input
              {...register("githubToken")}
              placeholder="Github Token(Optional)"
            />
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