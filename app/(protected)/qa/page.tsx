"use client";
import { getQuestions } from "@/app/actions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import useProject from "@/hooks/use-project"
import { useQuery } from "@tanstack/react-query";
import AskQuestionsCard from "../dashboard/ask-questions-card";
import React, { useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import CodeReferences from "../dashboard/code-references";
import { useTheme } from "next-themes";

const QAPage = () => {
  const { projectId } = useProject();
  const { resolvedTheme } = useTheme();
  const [questionIndex, setquestionIndex] = useState<number>(0)
  
  const { data: questions } = useQuery({
    queryKey: ["questions", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      return await getQuestions(projectId)
    },
    enabled: !!projectId,
  });

  const question = questions?.[questionIndex]

  return (
    <Sheet>
      <AskQuestionsCard />
      <div className="h-4"></div>
      <h1 className="text-xl font-semibold mb-2">Saved Questions</h1>
      <div className="flex flex-col gap-6">
        {questions?.map((question, index) =>
          <React.Fragment key={question.id}>
            <SheetTrigger onClick={() => setquestionIndex(index)}>
              <div className="flex items-center gap-4 bg-card text-card-foreground rounded-lg p-3 shadow border border-border">
                <img className="rounded-full object-contain" height={32} width={32} src={question.user.imageUrl ?? ""}/>

                <div className="flex flex-col text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-foreground line-clamp-1 font-medium">
                      {question.question}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {question.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-muted-foreground line-clamp-1 text-sm">
                      {question.answer}
                    </p>
                </div>
              </div>
            </SheetTrigger>
          </React.Fragment>
        )}
      </div>
      
      {
        question && (
          <SheetContent className="sm:max-w-[70vw]">
            <SheetHeader>
              <SheetTitle>
                {question.question}
              </SheetTitle>
              <div data-color-mode={resolvedTheme === 'dark' ? 'dark' : 'light'}>
                <MDEditor.Markdown source={question.answer}/>
              </div>
              <CodeReferences fileReferences={(question.fileReferences ?? []) as any} />
            </SheetHeader>
          </SheetContent>
        )
      }



    </Sheet>
  )
}

export default QAPage
