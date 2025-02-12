"use server"

import { createFormSchema, TFormData } from "@/utils/schema";

export async function submitCreateForm (formdata: TFormData){
  const result = createFormSchema.safeParse(formdata);

  if (!result.success) {
    return {error: result.error.format()}
  }

  console.log(result.data)

  return {success: "Project created successfully"}

} 