"use client";

import MDEditor from "@uiw/react-md-editor";
import { askQuestion, saveQuestion } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import useProject from "@/hooks/use-project";
import { readStreamableValue } from "@ai-sdk/rsc";
import { Loader2, Send } from "lucide-react";
import { FormEvent, KeyboardEvent, useState } from "react";
import "@/app/markdown-container.css";
import CodeReferences from "./code-references";
import { toast } from "sonner";
import { getQueryClient } from "@/lib/react-query";
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

      for await (const delta of readStreamableValue(output)) {
        if (delta) {
          setAnswer((prev) => (prev ? prev + delta : delta));
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
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (question.trim() && !loading) {
        const form = e.currentTarget.closest('form');
        if (form) {
          const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
          form.dispatchEvent(submitEvent);
        }
      }
    }
    if ((e.key === 'Enter' && e.ctrlKey) || (e.key === 'Enter' && e.metaKey)) {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const before = text.substring(0, start);
      const after = text.substring(end);
      setQuestion(before + '\n' + after);

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
        error: () => "Something went wrong.",
      }
    );

    getQueryClient().invalidateQueries({ queryKey: ["questions"] });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[70vw]">
          <DialogHeader className="flex flex-shrink-0 flex-row items-center justify-between space-y-0 border-b border-border px-5 py-3">
            <DialogTitle className="font-mono text-xs text-muted-foreground">{"// aicommit response"}</DialogTitle>
            <Button variant="outline" size="sm" onClick={handleQuestionSave}>
              Save
            </Button>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto overflow-x-hidden p-5">
            <div
              data-color-mode={resolvedTheme === 'dark' ? 'dark' : 'light'}
              className="prose prose-sm sm:prose-base max-w-none px-2 py-2"
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
          <div className="flex flex-shrink-0 border-t border-border px-5 py-3">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="relative w-full overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="font-mono text-[11px] text-primary">{"// ask the codebase"}</span>
          <span className="font-mono text-[10px] text-muted-foreground">⏎ to send</span>
        </div>
        <div className="p-5">
          <form onSubmit={handleSubmit}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-3.5 font-mono text-sm text-primary">›</span>
              <Textarea
                placeholder="which file handles authentication?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-32 w-full resize-none border-border bg-background pl-8 font-mono text-sm placeholder:text-muted-foreground/50 focus-visible:ring-primary/30"
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] text-muted-foreground">
                enter to submit · ctrl+enter for newline
              </p>
              <Button
                type="submit"
                disabled={loading}
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> thinking…
                  </>
                ) : (
                  <>
                    <Send className="size-3.5" /> ask
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default AskQuestionsCard;
