"use client";
import { getQuestions } from "@/app/actions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import useProject from "@/hooks/use-project"
import { useQuery } from "@tanstack/react-query";
import AskQuestionsCard from "../dashboard/ask-questions-card";
import React, { useEffect, useRef, useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import CodeReferences from "../dashboard/code-references";
import { useTheme } from "next-themes";
import { toast } from "sonner";

const QAPage = () => {
  const { projectId } = useProject();
  const { resolvedTheme } = useTheme();
  const [questionIndex, setquestionIndex] = useState<number>(0)
  
  const { data: questions, status } = useQuery({
    queryKey: ["questions", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      return await getQuestions(projectId)
    },
    enabled: !!projectId,
  });

  const questionsToastShownRef = useRef(false);
  useEffect(() => {
    const isPending = status === "pending";
    if (isPending && !questionsToastShownRef.current) {
      toast.message("Loading questions...", { id: "loading-questions", duration: 1200 });
      questionsToastShownRef.current = true;
    } else if (!isPending) {
      questionsToastShownRef.current = false;
    }
  }, [status]);

  const question = questions?.[questionIndex]

  return (
    <Sheet>
      <div className="w-full">
        <AskQuestionsCard />
        <div className="h-4"></div>
        <h1 className="text-xl font-semibold mb-2">Saved Questions</h1>
        <div className="flex flex-col gap-4">
          {questions?.map((question, index) =>
            <React.Fragment key={question.id}>
              <SheetTrigger onClick={() => setquestionIndex(index)} className="w-full text-left">
                <div className="flex items-start gap-3 bg-card text-card-foreground rounded-lg p-3 shadow border border-border w-full">
                  <img className="rounded-full object-contain mt-1" height={32} width={32} src={question.user.imageUrl ?? ""}/>

                  <div className="flex flex-col text-left flex-grow min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-foreground font-medium line-clamp-2">
                        {question.question}
                      </p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                        {question.createdAt.toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-sm mt-1">
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
            <SheetContent 
              side="right" 
              className="w-full sm:max-w-none sm:w-[90vw] md:w-[70vw] lg:w-[60vw] xl:w-[50vw] h-screen flex flex-col p-4 sm:p-6"
            >
              <SheetHeader className="flex-shrink-0">
                <SheetTitle className="break-words text-base sm:text-lg md:text-xl">
                  {question.question}
                </SheetTitle>
              </SheetHeader>
              <div className="flex-grow overflow-y-auto overflow-x-hidden mt-4">
                <div 
                  data-color-mode={resolvedTheme === 'dark' ? 'dark' : 'light'}
                  className="prose prose-sm sm:prose-base max-w-none"
                >
                  <MDEditor.Markdown 
                    className="!bg-transparent !text-foreground !max-h-none !overflow-visible [&_pre]:!bg-muted/40 [&_pre]:!text-foreground [&_pre]:!border [&_code]:!text-foreground"
                    source={question.answer}
                  />
                </div>
                <div className="mt-6">
                  <CodeReferences fileReferences={(question.fileReferences ?? []) as any} />
                </div>
              </div>
            </SheetContent>
          )
        }
      </div>
    </Sheet>
  )
}

export default QAPage
