"use client";

import {
  createConversation,
  sendMessage,
  editMessage,
  getConversationMessages,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import useProject from "@/hooks/use-project";
import { readStreamableValue } from "@ai-sdk/rsc";
import { Loader2, Send, FileCode, ChevronRight, X, Brain, Pencil } from "lucide-react";
import MDEditor from "@uiw/react-md-editor";
import { useTheme } from "next-themes";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import "@/app/markdown-container.css";
import CodeReferences from "./code-references";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type Message = {
  id: string;
  role: string;
  content: string;
  fileReferences: any;
  createdAt: string | Date;
};

const AskQuestionsCard = () => {
  const { project } = useProject();
  const { resolvedTheme } = useTheme();
  const queryClient = useQueryClient();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [streamingFiles, setStreamingFiles] = useState<any[]>([]);

  useEffect(() => setMounted(true), []);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, streamingContent, streamingThinking]);

  // Load messages when conversationId changes
  useEffect(() => {
    if (!conversationId || !open) return;
    (async () => {
      const res = await getConversationMessages(conversationId);
      if (res.success) setMessages(res.messages);
    })();
  }, [conversationId, open]);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      // Reset on close, but keep conversation saved in DB
      setQuestion("");
      setStreamingContent("");
      setStreamingThinking("");
      setIsStreaming(false);
      // Invalidate so /qa page picks up the new conversation
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: ["conversations", project?.id] });
      }
    } else {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!question.trim() || isStreaming || !project?.id) return;

    let convId = conversationId;
    if (!convId) {
      const createRes = await createConversation(project.id);
      if (!createRes.success) {
        toast.error("Failed to create conversation");
        return;
      }
      convId = createRes.conversationId!;
      setConversationId(convId);
    }

    const userMessage: Message = {
      id: "temp-" + Date.now(),
      role: "user",
      content: question,
      fileReferences: null,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentQuestion = question;
    setQuestion("");
    setIsStreaming(true);
    setStreamingContent("");
    setStreamingThinking("");
    setStreamingFiles([]);

    try {
      const { output, fileReference } = await sendMessage(convId, currentQuestion, project.id);
      if (fileReference) setStreamingFiles(fileReference);

      let fullResponse = "";
      for await (const delta of readStreamableValue(output) as any) {
        if (!delta) continue;
        if (delta.type === "thinking") {
          setStreamingThinking((prev) => prev + delta.content);
        } else if (delta.type === "answer") {
          fullResponse += delta.content;
          setStreamingContent((prev) => (prev ? prev + delta.content : delta.content));
        }
      }

      // Add assistant message to local state immediately (no gap)
      setMessages((prev) => [...prev, {
        id: "temp-assistant-" + Date.now(),
        role: "assistant",
        content: fullResponse,
        fileReferences: fileReference && fileReference.length > 0 ? fileReference : null,
        createdAt: new Date().toISOString(),
      }]);

      // Refresh from DB to get the real message with proper ID
      const res = await getConversationMessages(convId);
      if (res.success) setMessages(res.messages);
      queryClient.invalidateQueries({ queryKey: ["conversations", project?.id] });
    } catch (error: any) {
      toast.error(error.message || "Failed to get response");
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      setStreamingThinking("");
      setStreamingFiles([]);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!conversationId || !project?.id) return;

    const editIndex = messages.findIndex((m) => m.id === messageId);
    if (editIndex === -1) return;

    // Truncate messages after the edited one, replace with new user message
    const updatedMessages = messages.slice(0, editIndex);
    updatedMessages.push({
      id: "temp-" + Date.now(),
      role: "user",
      content: newContent,
      fileReferences: null,
      createdAt: new Date().toISOString(),
    });
    setMessages(updatedMessages);

    setIsStreaming(true);
    setStreamingContent("");
    setStreamingThinking("");
    setStreamingFiles([]);

    try {
      const { output, fileReference } = await editMessage(messageId, newContent, conversationId, project.id);
      if (fileReference) setStreamingFiles(fileReference);

      let fullResponse = "";
      for await (const delta of readStreamableValue(output) as any) {
        if (!delta) continue;
        if (delta.type === "thinking") {
          setStreamingThinking((prev) => prev + delta.content);
        } else if (delta.type === "answer") {
          fullResponse += delta.content;
          setStreamingContent((prev) => (prev ? prev + delta.content : delta.content));
        }
      }

      // Add assistant message to local state immediately (no gap)
      setMessages((prev) => [...prev, {
        id: "temp-assistant-" + Date.now(),
        role: "assistant",
        content: fullResponse,
        fileReferences: fileReference && fileReference.length > 0 ? fileReference : null,
        createdAt: new Date().toISOString(),
      }]);

      // Refresh from DB to get the real message with proper ID
      const res = await getConversationMessages(conversationId);
      if (res.success) setMessages(res.messages);
      queryClient.invalidateQueries({ queryKey: ["conversations", project?.id] });
    } catch (error: any) {
      toast.error(error.message || "Failed to edit message");
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      setStreamingThinking("");
      setStreamingFiles([]);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[800px]">
          {/* Header */}
          <DialogHeader className="flex flex-shrink-0 flex-row items-center justify-between space-y-0 border-b border-border px-5 py-3">
            <DialogTitle className="font-mono text-xs text-muted-foreground">
              {conversationId ? "// conversation" : "// ask the codebase"}
            </DialogTitle>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </DialogHeader>

          {/* Messages */}
          <div className="flex-grow overflow-y-auto p-5">
            <div className="space-y-4">
              {messages.length === 0 && !isStreaming && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border bg-background">
                    <FileCode className="size-5 text-primary" />
                  </div>
                  <p className="font-mono text-sm font-medium">ask anything about your codebase</p>
                  <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                    specific questions get code-level answers · general questions get overviews
                  </p>
                </div>
              )}
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  id={msg.id}
                  role={msg.role}
                  content={msg.content}
                  fileReferences={msg.fileReferences}
                  resolvedTheme={resolvedTheme}
                  onEdit={handleEditMessage}
                />
              ))}

              {isStreaming && (
                <MessageBubble
                  role="assistant"
                  content={streamingContent || ""}
                  thinking={streamingThinking || undefined}
                  fileReferences={streamingFiles.length > 0 ? streamingFiles : null}
                  resolvedTheme={resolvedTheme}
                  isStreaming
                />
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-border p-4">
            <form onSubmit={handleSubmit}>
              <div className="relative flex items-end gap-2 rounded-lg border border-border bg-background p-2">
                <span className="pointer-events-none absolute left-3 top-3 font-mono text-sm text-primary">›</span>
                <Textarea
                  ref={inputRef}
                  placeholder="ask a follow-up..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="min-h-[36px] max-h-32 flex-1 resize-none border-0 bg-transparent pl-6 font-mono text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0"
                  disabled={isStreaming}
                />
                <button
                  type="submit"
                  disabled={!question.trim() || isStreaming}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-30"
                >
                  {isStreaming ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 px-2 font-mono text-[10px] text-muted-foreground/50">
                enter to send · shift+enter for newline · auto-saved
              </p>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Card on the dashboard */}
      <div className="relative w-full overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="font-mono text-[11px] text-primary">{"// ask the codebase"}</span>
          <span className="font-mono text-[10px] text-muted-foreground">⏎ to send</span>
        </div>
        <div className="p-5">
          <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) { setOpen(true); handleSubmit(); } }}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-3.5 font-mono text-sm text-primary">›</span>
              <Textarea
                placeholder="which file handles authentication?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (question.trim()) {
                      setOpen(true);
                      handleSubmit();
                    }
                  }
                }}
                className="h-24 w-full resize-none border-border bg-background pl-8 font-mono text-sm placeholder:text-muted-foreground/50 focus-visible:ring-primary/30"
                disabled={!mounted || !project}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] text-muted-foreground">
                {project ? "enter to start a conversation" : "select a project first"}
              </p>
              <Button
                type="submit"
                disabled={!mounted || !question.trim() || !project}
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Send className="size-3.5" /> ask
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

function MessageBubble({
  id,
  role,
  content,
  fileReferences,
  resolvedTheme,
  isStreaming,
  thinking,
  onEdit,
}: {
  id?: string;
  role: string;
  content: string;
  fileReferences: any;
  resolvedTheme: string | undefined;
  isStreaming?: boolean;
  thinking?: string;
  onEdit?: (messageId: string, newContent: string) => void;
}) {
  const isUser = role === "user";
  const [showFiles, setShowFiles] = useState(false);
  const [userToggledThinking, setUserToggledThinking] = useState(false);
  const [userShowThinking, setUserShowThinking] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);

  // Derived: auto-collapse thinking when answer starts, unless user manually toggled
  const showThinking = userToggledThinking ? userShowThinking : !content;

  const toggleThinking = () => {
    setUserToggledThinking(true);
    setUserShowThinking((prev) => !prev);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && onEdit && id) {
      onEdit(id, editContent.trim());
      setIsEditing(false);
    }
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[85%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-lg px-4 py-3 text-[13px] leading-relaxed ${
            isUser
              ? "bg-primary/10 text-foreground"
              : "border border-border bg-background text-foreground"
          }`}
        >
          {isUser ? (
            isEditing ? (
              <div className="flex flex-col gap-2 min-w-[240px]">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveEdit();
                    } else if (e.key === "Escape") {
                      setEditContent(content);
                      setIsEditing(false);
                    }
                  }}
                  autoFocus
                  rows={2}
                  className="w-full resize-none rounded-md border border-border bg-background p-2 font-mono text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => { setEditContent(content); setIsEditing(false); }}
                    className="font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="font-mono text-[10px] text-primary transition-colors hover:text-primary/80"
                  >
                    send ↵
                  </button>
                </div>
              </div>
            ) : (
              <div className="group relative">
                <p className="whitespace-pre-wrap pr-6">{content}</p>
                {onEdit && id && (
                  <button
                    onClick={() => { setEditContent(content); setIsEditing(true); }}
                    className="absolute -right-1 -top-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                  >
                    <Pencil className="size-3" />
                  </button>
                )}
              </div>
            )
          ) : (
            <>
              {/* Thinking section (reasoning models only) */}
              {thinking && (
                <div className="mb-2.5 rounded-md border border-border/40 bg-muted/10 px-3 py-2">
                  <button
                    onClick={toggleThinking}
                    className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
                  >
                    <Brain className="size-3" />
                    <span>thinking</span>
                    <ChevronRight className={`size-2.5 transition-transform ${showThinking ? "rotate-90" : ""}`} />
                  </button>
                  {showThinking && (
                    <p className="mt-1.5 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-[1.6] text-muted-foreground/60">
                      {thinking}
                    </p>
                  )}
                </div>
              )}

              {content ? (
                <div
                  data-color-mode={resolvedTheme === "dark" ? "dark" : "light"}
                  className="prose prose-sm max-w-none prose-p:leading-relaxed prose-p:my-2 prose-headings:font-mono prose-headings:font-semibold prose-h1:text-base prose-h2:text-sm prose-h3:text-[13px] prose-code:rounded prose-code:bg-muted/40 prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted/40 prose-pre:border prose-pre:rounded-md prose-a:text-primary prose-a:no-underline prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-blockquote:border-l-primary/30 prose-blockquote:pl-3 [&_pre]:!bg-muted/40 [&_pre]:!border [&_code]:!text-foreground"
                >
                  <MDEditor.Markdown source={content} />
                  {isStreaming && (
                    <span className="animate-blink ml-0.5 inline-block h-3.5 w-[7px] translate-y-[1px] bg-primary" />
                  )}
                </div>
              ) : !thinking ? (
                <div className="flex items-center gap-2 py-1">
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  <span className="font-mono text-[11px] text-muted-foreground">thinking…</span>
                </div>
              ) : null}
            </>
          )}
        </div>

        {fileReferences && fileReferences.length > 0 && (
          <div className="w-full">
            <button
              onClick={() => setShowFiles(!showFiles)}
              className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-primary"
            >
              <ChevronRight
                className={`size-3 transition-transform ${showFiles ? "rotate-90" : ""}`}
              />
              {fileReferences.length} file{fileReferences.length > 1 ? "s" : ""} referenced
            </button>
            {showFiles && (
              <div className="mt-1.5">
                <CodeReferences fileReferences={fileReferences} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AskQuestionsCard;
