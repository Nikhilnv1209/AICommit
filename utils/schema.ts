import {z} from 'zod';

export const createFormSchema = z.object({
  projectName: z.string().nonempty("Repo name cannot be empty"),
  repoUrl: z.string().url().nonempty("Repo URL cannot be empty"),
  githubToken: z.string().optional()
})

export type TFormData = z.infer<typeof createFormSchema>