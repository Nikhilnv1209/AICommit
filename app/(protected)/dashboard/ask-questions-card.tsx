"use client";

import MDEditor from "@uiw/react-md-editor";
import { askQuestion, saveQuestion } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import useProject from "@/hooks/use-project";
import { readStreamableValue } from "ai/rsc";
import Image from "next/image";
import { FormEvent, KeyboardEvent, useState } from "react";
import "@/app/markdown-container.css";
import CodeReferences from "./code-references";
import { toast } from "sonner";
import { getQueryClient } from "@/lib/react-query";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

const AskQuestionsCard = () => {
  const { project } = useProject();
  const { resolvedTheme } = useTheme();
  const [question, setQuestion] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileReferences, setFileReference] = useState<{ fileName: string, sourceCode: string, summary: string }[]>([]);
  const [answer, setAnswer] = useState<string>("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!project?.id) return;
    if (!question) return;
    if (loading) return;
    setAnswer("");
    setFileReference([]);
    setLoading(true);

    try {
      const { output, fileReference } = await askQuestion(question, project.id);
      setFileReference(fileReference);

      // Start reading the stream
      for await (const delta of readStreamableValue(output)) {
        if (delta) {
          setAnswer((prev) => (prev ? prev + delta : delta));
          // Open dialog only when we start receiving content
          if (!open && delta) {
            setOpen(true);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Ctrl/Meta)
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      // Only submit if there's text and not loading
      if (question.trim() && !loading) {
        // Create a synthetic form submit event
        const form = e.currentTarget.closest('form');
        if (form) {
          const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
          form.dispatchEvent(submitEvent);
        }
      }
    }
    // For Ctrl+Enter, we manually insert a newline
    if ((e.key === 'Enter' && e.ctrlKey) || (e.key === 'Enter' && e.metaKey)) {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const before = text.substring(0, start);
      const after = text.substring(end);
      setQuestion(before + '\n' + after);
      
      // Set cursor position after the inserted newline
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      }, 0);
    }
  };

  const handleQuestionSave = async () => {
    if (!project?.id || !question || !answer) {
      toast.error("Something when wrong.");
      return;
    }

    toast.promise(
      saveQuestion(project.id, question, answer, fileReferences),
      {
        loading: "Saving...",
        success: () => "Saved successfully!",
        error: (err) => {
          console.error(err);
          return "Something went wrong.";
        },
      }
    );
    
    getQueryClient().invalidateQueries({queryKey: ["questions"]})
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[70vw] max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <DialogTitle>
                <Image 
                  src="/logo-dark.png" 
                  alt="logo" 
                  width={40} 
                  height={40} 
                  className="dark:hidden block" 
                />
                <Image 
                  src="/logo-light.png" 
                  alt="logo" 
                  width={40} 
                  height={40} 
                  className="hidden dark:block" 
                />
              </DialogTitle>
              <Button variant={"outline"} onClick={handleQuestionSave}>
                Save Answer
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto overflow-x-hidden">
            <div 
              data-color-mode={resolvedTheme === 'dark' ? 'dark' : 'light'}
              className="prose prose-sm sm:prose-base max-w-none py-4 px-2"
            >
              <MDEditor.Markdown
                source={answer}
                className="!bg-transparent !text-foreground !max-h-none !overflow-visible [&_pre]:!bg-muted/40 [&_pre]:!text-foreground [&_pre]:!border [&_code]:!text-foreground"
              />
              <div className="mt-6">
                <CodeReferences fileReferences={fileReferences || []} />
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 mt-4">
            <Button type="button" onClick={() => setOpen(false)} className="w-full sm:w-auto">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Card className="relative w-full">
        <CardHeader>
          <CardTitle className="font-bold text-lg">Ask a Question</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Textarea
              placeholder="Which file should I edit to change the home page"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-32 w-full"
            />
            <div className="mt-1 text-xs text-muted-foreground">
              Press Enter to submit · Ctrl+Enter for new line
            </div>
            <div className="h-4"></div>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading ? (
                <div className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Ask AICommit</span>
                </div>
              ) : (
                "Ask AICommit"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
};

export default AskQuestionsCard;
