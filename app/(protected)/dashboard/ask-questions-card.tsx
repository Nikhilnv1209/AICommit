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
import { FormEvent, useState } from "react";
import "@/app/markdown-container.css";
import CodeReferences from "./code-references";
import { toast } from "sonner";

const AskQuestionsCard = () => {
  const { project } = useProject();
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
    setOpen(true);

    const { output, fileReference } = await askQuestion(question, project.id);
    setFileReference(fileReference);

    for await (const delta of readStreamableValue(output)) {
      if (delta) {
        setAnswer((prev) => (prev ? prev + delta : delta));
      }
    }
    setLoading(false);
  };

  const handleQuestionSave = async () => {
    if (!project?.id || !question || !answer) {
      toast.error("Something when wrong.");
      return;
    }

    saveQuestion(project.id, question, answer, fileReferences).then(() => {
      toast.success("Question saved successfully.");
    }).catch((error) => {
      console.error("Error saving question:", error);
      toast.error("Something went wrong while saving the question.");
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[70vw]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>
                <Image src={"/logo.png"} alt="logo" width={40} height={40} />
              </DialogTitle>
              <Button variant={"outline"} onClick={handleQuestionSave}>
                Save Answer
              </Button>
            </div>
          </DialogHeader>
          <div data-color-mode="light">
            <MDEditor.Markdown
              source={answer}
              className="w-full max-h-[60vh] overflow-y-auto break-words py-4 px-2 custom-markdown-scroll" // Add a custom class
            />
            <CodeReferences fileReferences={fileReferences || []} />
          </div>
          <Button type="button" onClick={() => setOpen(false)}>Close</Button>
        </DialogContent>
      </Dialog>
      <Card className="relative col-span-3">
        <CardHeader>
          <CardTitle className="font-bold text-lg">Ask a Question</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Textarea
              placeholder="Which file should I edit to change the home page"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="h-32"
            />
            <div className="h-4"></div>
            <Button type="submit">Ask AICommit</Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
};

export default AskQuestionsCard;